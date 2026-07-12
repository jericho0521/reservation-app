import { parsePrepareBookingInput } from "@project-play/reservation-chat-core";
import type { JsonValue } from "@reservation-platform/contract-types";
import type { ConversationResponder, ConversationResponderResult } from "./conversation-orchestrator.js";

const bookingPattern = /^book\s+(.+?)\s+on\s+(\d{4}-\d{2}-\d{2})\s+at\s+(\d{2}:\d{2})\s+for\s+(\d+)\s*;\s*([^;]+)\s*;\s*([^;]+)\s*;\s*(.+)$/iu;

export function createDeterministicConversationResponder(): ConversationResponder {
  return {
    async respond(input) {
      const match = bookingPattern.exec(input.message.trim());
      if (match) {
        const service = input.experience.services.find((candidate) => candidate.name.toLocaleLowerCase() === match[1]!.trim().toLocaleLowerCase());
        const booking = service ? parsePrepareBookingInput({
          service_id: service.serviceId,
          service_name: service.name,
          date: match[2],
          start_time: match[3],
          seats: Number(match[4]),
          user_name: match[5],
          user_email: match[6],
          user_phone: match[7],
        }) : null;
        if (booking) return { supported: true, content: `Please confirm ${booking.seats} × ${booking.service_name} on ${booking.date} at ${booking.start_time}.`, booking };
      }
      const normalized = input.message.toLocaleLowerCase();
      const knowledge = input.experience.knowledge.find((entry) => entry.question.toLocaleLowerCase().split(/\W+/u).filter((word) => word.length > 3).some((word) => normalized.includes(word)));
      if (knowledge) return { supported: true, content: knowledge.answer };
      const names = input.experience.services.map((service) => service.name).join(", ");
      return {
        supported: true,
        content: `I can help book ${names || "an available service"}. Use: Book <service> on YYYY-MM-DD at HH:MM for <quantity>; <name>; <email>; <phone>.`,
      };
    },
  };
}

export interface ConversationAgentRuntime {
  run(input: {
    scope: { tenant_id: string; venue_id: string };
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    system_prompt?: string;
    response_schema?: JsonValue;
  }): Promise<{ message: { content: string }; data?: JsonValue }>;
}

export function createAgentConversationResponder(runtime: ConversationAgentRuntime, fallback = createDeterministicConversationResponder()): ConversationResponder {
  return {
    async respond(input): Promise<ConversationResponderResult> {
      try {
        const output = await runtime.run({
          scope: { tenant_id: input.scope.tenantId, venue_id: input.scope.venueId },
          system_prompt: [
            `You are the booking assistant for ${input.experience.businessName}.`,
            `Services: ${input.experience.services.map((service) => `${service.serviceId}=${service.name}`).join(", ")}.`,
            "Return JSON only. Never claim a booking is confirmed. A booking proposal must use an exact listed service id and wait for explicit confirmation.",
            `Knowledge: ${input.experience.knowledge.map((entry) => `${entry.question}: ${entry.answer}`).join(" | ")}`,
          ].join("\n"),
          messages: [{ role: "user", content: input.message }],
          response_schema: agentResponseSchema,
        });
        const data = asRecord(output.data);
        const booking = parsePrepareBookingInput(data.booking);
        return {
          supported: data.supported !== false,
          content: typeof data.reply === "string" && data.reply.trim() ? data.reply.trim() : output.message.content,
          ...(booking ? { booking } : {}),
        };
      } catch {
        return fallback.respond(input);
      }
    },
  };
}

const agentResponseSchema: JsonValue = {
  type: "object",
  properties: {
    reply: { type: "string" },
    supported: { type: "boolean" },
    booking: {
      type: "object",
      properties: {
        service_id: { type: "string" }, service_name: { type: "string" }, date: { type: "string" }, start_time: { type: "string" },
        seats: { type: "number" }, user_name: { type: "string" }, user_email: { type: "string" }, user_phone: { type: "string" },
      },
      required: ["service_id", "service_name", "date", "start_time", "seats", "user_name", "user_email", "user_phone"],
      additionalProperties: false,
    },
  },
  required: ["reply", "supported"],
  additionalProperties: false,
};

function asRecord(value: JsonValue | undefined): Record<string, JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
