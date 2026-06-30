import type { AgentRuntime } from "@reservation-platform/ai-chat";
import type {
  AvailabilityResponse,
  CreateReservationInput,
  JsonValue,
  MetadataRecord,
  ReservationResponse,
  ServiceResponse,
} from "@reservation-platform/contract-types";
import {
  isConfirmationMessage,
  mergeBookingFields,
  missingBookingFields,
  normalizeBookingFields,
  readWhatsAppServiceBookingConfig,
  summarizeBookingDraft,
  type WhatsAppBookingFields,
} from "./booking-config.js";
import type { WhatsAppAgentResponder, WhatsAppAgentResponderInput, WhatsAppAgentResponderOutput } from "./module.js";
import type { WhatsAppConversationMessage } from "./storage.js";

export interface WhatsAppReservationTools {
  listServices(): Promise<ServiceResponse[]>;
  getService(serviceId: string): Promise<ServiceResponse | undefined>;
  checkAvailability(input: { serviceId: string; date: string }): Promise<AvailabilityResponse>;
  createReservation(input: CreateReservationInput): Promise<ReservationResponse>;
}

export interface WhatsAppBookingAutomationOptions {
  agentRuntime?: AgentRuntime;
  reservationTools?: WhatsAppReservationTools;
  readiness?: WhatsAppAutomationReadiness;
  now?: () => Date;
}

export interface WhatsAppAutomationReadiness {
  databaseReady?: boolean;
  providerReady?: boolean;
  whatsappConnected?: boolean;
}

export function createWhatsAppBookingAutomationResponder(
  options: WhatsAppBookingAutomationOptions = {},
): WhatsAppAgentResponder {
  const now = options.now ?? (() => new Date());

  return async (input) => {
    const readinessFailure = readinessFailureMessage(options.readiness, input.config.fallback_message);
    if (readinessFailure) {
      return readinessFailure;
    }

    if (!options.agentRuntime || !options.reservationTools) {
      return fallback(input, "automation_not_configured");
    }

    const services = await options.reservationTools.listServices();
    const latestDraft = latestPendingDraft(input.messages);
    if (latestDraft && isConfirmationMessage(input.message.message)) {
      return confirmDraft({
        input,
        draft: latestDraft,
        tools: options.reservationTools,
      });
    }

    const agentMessages = input.messages.slice(-12).map((message) => ({
      role: message.direction === "inbound" ? "user" as const : "assistant" as const,
      content: message.content,
    }));
    const lastAgentMessage = agentMessages.at(-1);
    if (lastAgentMessage?.role !== "user" || lastAgentMessage.content !== input.message.message) {
      agentMessages.push({ role: "user", content: input.message.message });
    }

    const agent = await options.agentRuntime.run({
      scope: {
        tenant_id: String(input.config.metadata?.tenant_id ?? "self-host"),
        venue_id: input.config.metadata?.venue_id ? String(input.config.metadata.venue_id) : undefined,
      },
      system_prompt: buildSystemPrompt(input, services),
      retrieval_context: input.knowledge.map((entry) => ({
        id: entry.title,
        content: `${entry.title}: ${entry.content}`,
        source: "whatsapp_knowledge",
      })),
      messages: agentMessages,
      response_schema: whatsappAgentResponseSchema(),
      metadata: { channel: "whatsapp" },
    });

    const fields = mergeBookingFields(latestDraft?.fields, normalizeBookingFields(readObject(agent.data)?.fields));
    const serviceId = fields.service_id ?? input.config.default_service_id ?? services[0]?.service_id;
    if (!serviceId) {
      return {
        content: "I can help with a booking, but no bookable service is configured yet. Please contact staff.",
        metadata: { responder: "booking_automation", reason: "missing_service" },
      };
    }

    const service = await options.reservationTools.getService(serviceId);
    if (!service) {
      return {
        content: "I could not find that service. Which service would you like to book?",
        metadata: { responder: "booking_automation", reason: "service_not_found" },
      };
    }

    const normalizedFields = mergeBookingFields(fields, { service_id: service.service_id });
    const bookingConfig = readWhatsAppServiceBookingConfig(service);
    const missing = missingBookingFields(normalizedFields, bookingConfig);
    if (missing.length > 0) {
      return {
        content: typeof readObject(agent.data)?.reply === "string"
          ? String(readObject(agent.data)?.reply)
          : `Please provide: ${missing.map((field) => field.label).join(", ")}.`,
        metadata: {
          responder: "booking_automation",
          reason: "missing_fields",
          missing_fields: missing.map((field) => field.name).join(","),
        },
      };
    }

    const availability = await options.reservationTools.checkAvailability({
      serviceId: service.service_id,
      date: normalizedFields.date!,
    });
    const slot = availability.slots.find((candidate) =>
      candidate.is_available &&
      (candidate.start_time === normalizedFields.start_time || candidate.start_at?.includes(`T${normalizedFields.start_time}`)),
    );
    if (!slot) {
      return {
        content: "That time is not available. Please choose another available time.",
        metadata: { responder: "booking_automation", reason: "availability_conflict" },
      };
    }

    const draft = {
      draft_id: `wa_${now().getTime()}`,
      fields: {
        ...normalizedFields,
        end_time: normalizedFields.end_time ?? slot.end_time,
        quantity: normalizedFields.quantity ?? bookingConfig.default_quantity ?? 1,
      },
      service_id: service.service_id,
      created_at: now().toISOString(),
    };
    const summary = summarizeBookingDraft({ service, fields: draft.fields });

    return {
      content: `Please confirm this booking:\n${summary}\n\nReply "confirm" to create the reservation.`,
      metadata: {
        responder: "booking_automation",
        draft_status: "pending_confirmation",
        draft_id: draft.draft_id,
        draft_json: JSON.stringify(draft),
      },
    };
  };
}

interface PendingDraft {
  draft_id: string;
  service_id: string;
  fields: WhatsAppBookingFields;
}

async function confirmDraft(input: {
  input: WhatsAppAgentResponderInput;
  draft: PendingDraft;
  tools: WhatsAppReservationTools;
}): Promise<WhatsAppAgentResponderOutput> {
  const service = await input.tools.getService(input.draft.service_id);
  if (!service) {
    return fallback(input.input, "service_not_found");
  }

  const fields = input.draft.fields;
  const reservation = await input.tools.createReservation({
    service_id: service.service_id,
    date: fields.date,
    start_time: fields.start_time,
    end_time: fields.end_time,
    quantity: fields.quantity ?? 1,
    resource_ids: fields.resource_ids,
    customer: {
      name: fields.customer_name,
      phone: fields.customer_phone,
    },
    source: "whatsapp",
    metadata: compactMetadata({
      whatsapp_conversation_id: input.input.conversation_id,
      whatsapp_draft_id: input.draft.draft_id,
      purpose: fields.purpose,
    }),
  });

  return {
    content: `Your reservation is confirmed. Booking ID: ${reservation.reservation_id}`,
    metadata: {
      responder: "booking_automation",
      draft_status: "confirmed",
      draft_id: input.draft.draft_id,
      reservation_id: reservation.reservation_id,
    },
  };
}

function latestPendingDraft(messages: WhatsAppConversationMessage[]): PendingDraft | undefined {
  const closedDraftIds = new Set(
    messages
      .filter((message) => message.metadata?.draft_status === "confirmed" || message.metadata?.draft_status === "failed")
      .map((message) => message.metadata?.draft_id)
      .filter((draftId): draftId is string => typeof draftId === "string" && draftId.length > 0),
  );

  for (const message of [...messages].reverse()) {
    if (message.direction !== "outbound" || message.metadata?.draft_status !== "pending_confirmation") {
      continue;
    }
    const draftId = message.metadata.draft_id;
    if (typeof draftId === "string" && closedDraftIds.has(draftId)) {
      continue;
    }
    const raw = message.metadata.draft_json;
    if (typeof raw !== "string") {
      continue;
    }
    try {
      const parsed = JSON.parse(raw) as PendingDraft;
      if (parsed?.draft_id && parsed?.service_id && parsed?.fields) {
        return parsed;
      }
    } catch {
      continue;
    }
  }
  return undefined;
}

function buildSystemPrompt(input: WhatsAppAgentResponderInput, services: ServiceResponse[]) {
  return [
    `You are the WhatsApp booking assistant for ${input.config.business_name}.`,
    "Collect booking details. Do not guess missing date, time, resource, quantity, customer name, or phone.",
    "Return JSON only with shape: {\"reply\":\"text\",\"fields\":{...}}.",
    `Available services: ${services.map((service) => `${service.name} (${service.service_id})`).join(", ")}`,
  ].join("\n");
}

function whatsappAgentResponseSchema(): JsonValue {
  return {
    type: "object",
    properties: {
      reply: { type: "string" },
      fields: { type: "object" },
    },
  };
}

function readinessFailureMessage(
  readiness: WhatsAppAutomationReadiness | undefined,
  fallbackMessage: string,
): WhatsAppAgentResponderOutput | undefined {
  if (!readiness) {
    return undefined;
  }
  if (readiness.databaseReady === false || readiness.providerReady === false || readiness.whatsappConnected === false) {
    return {
      content: fallbackMessage,
      metadata: {
        responder: "booking_automation",
        readiness: "not_ready",
      },
    };
  }
  return undefined;
}

function fallback(input: WhatsAppAgentResponderInput, reason: string): WhatsAppAgentResponderOutput {
  return {
    content: `${input.config.business_name}: ${input.config.fallback_message}`,
    metadata: { responder: "booking_automation", reason },
  };
}

function readObject(value: JsonValue | undefined): Record<string, JsonValue> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, JsonValue> : undefined;
}

function compactMetadata(input: Record<string, string | undefined>): MetadataRecord {
  return Object.fromEntries(
    Object.entries(input).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0),
  );
}
