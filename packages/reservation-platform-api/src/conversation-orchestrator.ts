import {
  bindPreparedBookingToAvailability,
  type BoundPreparedBooking,
  type PrepareBookingInput,
} from "@project-play/reservation-chat-core";
import type {
  AvailabilityResponse,
  ConversationChannel,
  ConversationMessageResponse,
  ConversationResponse,
  CreateReservationInput,
  JsonValue,
  PlatformErrorCode,
  PlatformErrorResponse,
  ReservationItemInput,
  ReservationResponse,
  ServiceResponse,
} from "@reservation-platform/contract-types";
import type { ConversationCreateInput, ConversationRepository } from "./conversations.js";
import type { ExperienceScope } from "./experience-studio.js";
import type { PlatformJobRepository } from "./jobs.js";

export interface NormalizedConversationInbound {
  channel: ConversationChannel;
  channelThreadId: string;
  externalMessageId?: string;
  content: string;
  participant: ConversationCreateInput["participant"];
}

export interface ConversationExperienceContext {
  businessName: string;
  knowledge: Array<{ question: string; answer: string }>;
  services: Array<{ serviceId: string; name: string }>;
}

export interface ConversationResponderResult {
  content: string;
  supported: boolean;
  booking?: PrepareBookingInput;
}

export interface ConversationResponder {
  respond(input: {
    scope: ExperienceScope;
    conversation: ConversationResponse;
    message: string;
    experience: ConversationExperienceContext;
  }): Promise<ConversationResponderResult>;
}

export interface ConversationBookingTools {
  getService(scope: ExperienceScope, serviceId: string): Promise<ServiceResponse | undefined>;
  checkAvailability(scope: ExperienceScope, input: { serviceId: string; date: string; staffId?: string }): Promise<AvailabilityResponse>;
  createReservation(scope: ExperienceScope, input: CreateReservationInput, idempotencyKey: string): Promise<ReservationResponse>;
}

export interface ConversationBookingProposal {
  proposalId: string;
  conversationId: string;
  booking: ConversationBoundBooking;
  status: "pending" | "confirming" | "confirmed";
  reservation?: ReservationResponse;
}

type ConversationBoundBooking = BoundPreparedBooking & {
  staff_id?: string;
  practitioner_name?: string;
  resource_ids?: string[];
  reservation_items?: ReservationItemInput[];
};

export interface ConversationBookingStateStore {
  save(scope: ExperienceScope, proposal: ConversationBookingProposal): Promise<void>;
  load(scope: ExperienceScope, proposalId: string): Promise<ConversationBookingProposal | undefined>;
  loadLatestActive(scope: ExperienceScope, conversationId: string): Promise<ConversationBookingProposal | undefined>;
  claim(scope: ExperienceScope, proposalId: string): Promise<"claimed" | "in_progress" | ReservationResponse | undefined>;
  release(scope: ExperienceScope, proposalId: string): Promise<void>;
  complete(scope: ExperienceScope, proposalId: string, reservation: ReservationResponse): Promise<void>;
}

export interface ConversationOrchestratorAuditSink {
  record(event: {
    type: "conversation.message.received" | "conversation.proposal.created" | "conversation.confirmation.started" | "conversation.reservation.created" | "conversation.workflow.failed";
    scope: ExperienceScope;
    conversationId?: string;
    data?: JsonValue;
  }): Promise<void> | void;
}

export interface ConversationOrchestratorDependencies {
  conversations: ConversationRepository;
  state: ConversationBookingStateStore;
  responder: ConversationResponder;
  tools: ConversationBookingTools;
  loadExperience(scope: ExperienceScope): Promise<ConversationExperienceContext>;
  audit?: ConversationOrchestratorAuditSink;
  createProposalId?: () => string;
}

export interface ConversationOrchestratorBody {
  conversation: ConversationResponse;
  message?: ConversationMessageResponse;
  proposal?: ConversationBookingProposal;
  reservation?: ReservationResponse;
  automation_suppressed?: boolean;
}

export type ConversationOrchestratorResult = {
  status: number;
  body: ConversationOrchestratorBody | PlatformErrorResponse;
};

export async function handleConversationInbound(input: {
  scope: ExperienceScope;
  message: NormalizedConversationInbound;
  dependencies: ConversationOrchestratorDependencies;
}): Promise<ConversationOrchestratorResult> {
  const scope = normalizeScope(input.scope);
  const content = input.message.content.trim();
  if (!scope || !input.message.channelThreadId.trim() || !content || content.length > 4000) {
    return failure(400, "validation_failed", "Conversation message is invalid.");
  }
  try {
    const conversationResult = await input.dependencies.conversations.getOrCreate(scope, {
      channel: input.message.channel,
      channelThreadId: input.message.channelThreadId.trim(),
      participant: input.message.participant,
    });
    if (conversationResult.error || !conversationResult.data) throw conversationResult.error ?? new Error("conversation unavailable");
    const conversation = conversationResult.data;
    const inbound = await input.dependencies.conversations.append(scope, conversation.conversation_id, {
      channel: input.message.channel,
      direction: "inbound",
      senderType: "customer",
      deliveryState: "delivered",
      externalMessageId: input.message.externalMessageId,
      content,
    });
    if (inbound.error || !inbound.data) throw inbound.error ?? new Error("message unavailable");
    await safeAudit(input.dependencies.audit, { type: "conversation.message.received", scope, conversationId: conversation.conversation_id });
    return processConversationMessage({ scope, conversation, content, inbound: inbound.data, dependencies: input.dependencies });
  } catch {
    await safeAudit(input.dependencies.audit, { type: "conversation.workflow.failed", scope });
    return failure(503, "storage_unavailable", "Conversation workflow is temporarily unavailable.", true);
  }
}

export async function acceptConversationInbound(input: {
  scope: ExperienceScope;
  message: NormalizedConversationInbound;
  conversations: ConversationRepository;
  jobs: Pick<PlatformJobRepository, "enqueue">;
  audit?: ConversationOrchestratorAuditSink;
}): Promise<ConversationOrchestratorResult> {
  const scope = normalizeScope(input.scope);
  const content = input.message.content.trim();
  if (!scope || !input.message.channelThreadId.trim() || !content || content.length > 4000) {
    return failure(400, "validation_failed", "Conversation message is invalid.");
  }
  try {
    const conversationResult = await input.conversations.getOrCreate(scope, {
      channel: input.message.channel,
      channelThreadId: input.message.channelThreadId.trim(),
      participant: input.message.participant,
    });
    if (conversationResult.error || !conversationResult.data) throw conversationResult.error ?? new Error("conversation unavailable");
    const conversation = conversationResult.data;
    const inbound = await input.conversations.append(scope, conversation.conversation_id, {
      channel: input.message.channel,
      direction: "inbound",
      senderType: "customer",
      deliveryState: "delivered",
      externalMessageId: input.message.externalMessageId,
      content,
    });
    if (inbound.error || !inbound.data) throw inbound.error ?? new Error("message unavailable");
    await safeAudit(input.audit, { type: "conversation.message.received", scope, conversationId: conversation.conversation_id });
    if (conversation.automation_state === "manual") {
      return { status: 200, body: { conversation, message: inbound.data, automation_suppressed: true } };
    }
    await input.jobs.enqueue({
      tenantId: scope.tenantId,
      venueId: scope.venueId,
      kind: "conversation.process_ai",
      payload: { conversationId: conversation.conversation_id, messageId: inbound.data.message_id },
      maxAttempts: 5,
      idempotencyKey: `conversation:${conversation.conversation_id}:message:${inbound.data.message_id}`,
    });
    return { status: 202, body: { conversation, message: inbound.data } };
  } catch {
    await safeAudit(input.audit, { type: "conversation.workflow.failed", scope });
    return failure(503, "storage_unavailable", "Conversation workflow is temporarily unavailable.", true);
  }
}

export async function processPersistedConversationInbound(input: {
  scope: ExperienceScope;
  conversationId: string;
  messageId: string;
  dependencies: ConversationOrchestratorDependencies;
}): Promise<ConversationOrchestratorResult> {
  const scope = normalizeScope(input.scope);
  if (!scope || !input.conversationId.trim() || !input.messageId.trim()) {
    return failure(400, "validation_failed", "Persisted conversation message is invalid.");
  }
  try {
    const [conversationResult, messagesResult] = await Promise.all([
      input.dependencies.conversations.get(scope, input.conversationId.trim()),
      input.dependencies.conversations.listMessages(scope, input.conversationId.trim(), { limit: 100 }),
    ]);
    if (conversationResult.error || messagesResult.error || !conversationResult.data) {
      throw conversationResult.error ?? messagesResult.error ?? new Error("conversation unavailable");
    }
    const inbound = (messagesResult.data ?? []).find((message) => message.message_id === input.messageId);
    if (!inbound || inbound.direction !== "inbound" || inbound.sender_type !== "customer") {
      return failure(404, "not_found", "Persisted conversation message not found.");
    }
    if (conversationResult.data.channel === "whatsapp" && isExplicitBookingConfirmation(inbound.content)) {
      const proposal = await input.dependencies.state.loadLatestActive(scope, conversationResult.data.conversation_id);
      if (proposal) {
        return confirmConversationBooking({
          scope,
          conversationId: conversationResult.data.conversation_id,
          proposalId: proposal.proposalId,
          dependencies: input.dependencies,
        });
      }
    }
    return processConversationMessage({
      scope,
      conversation: conversationResult.data,
      content: inbound.content,
      inbound,
      dependencies: input.dependencies,
    });
  } catch {
    await safeAudit(input.dependencies.audit, { type: "conversation.workflow.failed", scope });
    return failure(503, "storage_unavailable", "Conversation workflow is temporarily unavailable.", true);
  }
}

function isExplicitBookingConfirmation(content: string) {
  return /^(confirm|yes|confirm booking)$/iu.test(content.trim());
}

async function processConversationMessage(input: {
  scope: ExperienceScope;
  conversation: ConversationResponse;
  content: string;
  inbound: ConversationMessageResponse;
  dependencies: ConversationOrchestratorDependencies;
}): Promise<ConversationOrchestratorResult> {
  const { scope, conversation, content } = input;
  try {
    if (conversation.automation_state === "manual") {
      return { status: 200, body: { conversation, message: input.inbound, automation_suppressed: true } };
    }
    const experience = await input.dependencies.loadExperience(scope);
    const response = await input.dependencies.responder.respond({ scope, conversation, message: content, experience });
    let proposal: ConversationBookingProposal | undefined;
    if (response.booking) {
      proposal = await prepareProposal(scope, conversation, response.booking, input.dependencies);
    }
    const replyContent = response.booking && !proposal
      ? "I could not verify that service and time against current availability. Please choose one of the available options."
      : response.content.trim() || (response.supported ? "Please confirm the proposed booking." : "Please wait while staff checks this for you.");
    const appendReply = conversation.channel === "whatsapp" && input.dependencies.conversations.appendAutomationReplyWithOutbox
      ? input.dependencies.conversations.appendAutomationReplyWithOutbox.bind(input.dependencies.conversations)
      : input.dependencies.conversations.append.bind(input.dependencies.conversations);
    const outbound = await appendReply(scope, conversation.conversation_id, {
      channel: conversation.channel,
      direction: "outbound",
      senderType: "automation",
      deliveryState: conversation.channel === "whatsapp" ? "pending" : "sent",
      externalMessageId: `ai-reply:${input.inbound.message_id}`,
      content: replyContent,
      metadata: proposal ? { event: "booking.proposed", proposal_id: proposal.proposalId } : { event: response.supported ? "assistant.reply" : "assistant.unsupported" },
    });
    if (outbound.error || !outbound.data) throw outbound.error ?? new Error("reply unavailable");
    return { status: 200, body: { conversation, message: outbound.data, ...(proposal ? { proposal } : {}) } };
  } catch {
    const appendHandoff = conversation.channel === "whatsapp" && input.dependencies.conversations.appendAutomationReplyWithOutbox
      ? input.dependencies.conversations.appendAutomationReplyWithOutbox.bind(input.dependencies.conversations)
      : input.dependencies.conversations.append.bind(input.dependencies.conversations);
    const handoff = await appendHandoff(scope, conversation.conversation_id, {
      channel: conversation.channel,
      direction: "outbound",
      senderType: "automation",
      deliveryState: conversation.channel === "whatsapp" ? "pending" : "sent",
      externalMessageId: `ai-handoff:${input.inbound.message_id}`,
      content: "The booking assistant is temporarily unavailable. Please wait while staff checks this for you.",
      metadata: { event: "assistant.handoff" },
    });
    await safeAudit(input.dependencies.audit, { type: "conversation.workflow.failed", scope, conversationId: conversation.conversation_id });
    return handoff.data
      ? { status: 200, body: { conversation, message: handoff.data } }
      : failure(503, "storage_unavailable", "Conversation workflow is temporarily unavailable.", true);
  }
}

export async function confirmConversationBooking(input: {
  scope: ExperienceScope;
  conversationId: string;
  proposalId: string;
  dependencies: ConversationOrchestratorDependencies;
}): Promise<ConversationOrchestratorResult> {
  const scope = normalizeScope(input.scope);
  if (!scope || !input.conversationId.trim() || !input.proposalId.trim()) {
    return failure(400, "validation_failed", "Conversation confirmation is invalid.");
  }
  try {
    const conversationResult = await input.dependencies.conversations.get(scope, input.conversationId.trim());
    if (conversationResult.error) throw conversationResult.error;
    const conversation = conversationResult.data;
    if (!conversation) return failure(404, "not_found", "Conversation not found.");
    if (conversation.automation_state === "manual") {
      return failure(409, "conflict", "Staff currently controls this conversation.");
    }
    const proposal = await input.dependencies.state.load(scope, input.proposalId.trim());
    if (!proposal || proposal.conversationId !== conversation.conversation_id) {
      return failure(404, "not_found", "Booking proposal not found.");
    }
    if (proposal.status === "confirmed" && proposal.reservation) {
      return { status: 200, body: { conversation, proposal, reservation: proposal.reservation } };
    }
    const confirmationRequest = await input.dependencies.conversations.append(scope, conversation.conversation_id, {
      channel: conversation.channel,
      direction: "inbound",
      senderType: "system",
      deliveryState: "delivered",
      externalMessageId: `confirmation:${proposal.proposalId}`,
      content: "Booking confirmation requested.",
      metadata: { event: "booking.confirmation_requested", proposal_id: proposal.proposalId },
    });
    if (confirmationRequest.error || !confirmationRequest.data) throw confirmationRequest.error ?? new Error("confirmation request unavailable");
    const rebound = await revalidateProposal(scope, proposal.booking, input.dependencies.tools);
    if (!rebound) return failure(409, "conflict", "The proposed slot is no longer available.");
    const claim = await input.dependencies.state.claim(scope, proposal.proposalId);
    if (claim && typeof claim === "object") {
      return { status: 200, body: { conversation, proposal: { ...proposal, status: "confirmed", reservation: claim }, reservation: claim } };
    }
    if (claim === "in_progress") return failure(409, "conflict", "Booking confirmation is already in progress.", true);
    if (claim !== "claimed") return failure(404, "not_found", "Booking proposal not found.");
    await safeAudit(input.dependencies.audit, { type: "conversation.confirmation.started", scope, conversationId: conversation.conversation_id, data: { proposal_id: proposal.proposalId } });
    try {
      const reservation = await input.dependencies.tools.createReservation(scope, reservationInput(rebound, conversation.channel), `conversation-confirm-${proposal.proposalId}`);
      await input.dependencies.state.complete(scope, proposal.proposalId, reservation);
      const appendConfirmation = conversation.channel === "whatsapp" && input.dependencies.conversations.appendAutomationReplyWithOutbox
        ? input.dependencies.conversations.appendAutomationReplyWithOutbox.bind(input.dependencies.conversations)
        : input.dependencies.conversations.append.bind(input.dependencies.conversations);
      const message = await appendConfirmation(scope, conversation.conversation_id, {
        channel: conversation.channel,
        direction: "outbound",
        senderType: "automation",
        deliveryState: conversation.channel === "whatsapp" ? "pending" : "sent",
        content: `Booking confirmed. Reference: ${reservation.reservation_id}`,
        reservationId: reservation.reservation_id,
        metadata: { event: "booking.confirmed", proposal_id: proposal.proposalId },
      });
      if (message.error || !message.data) throw message.error ?? new Error("confirmation message unavailable");
      await safeAudit(input.dependencies.audit, { type: "conversation.reservation.created", scope, conversationId: conversation.conversation_id, data: { proposal_id: proposal.proposalId, reservation_id: reservation.reservation_id } });
      return { status: 200, body: { conversation, message: message.data, proposal: { ...proposal, status: "confirmed", reservation }, reservation } };
    } catch (error) {
      await input.dependencies.state.release(scope, proposal.proposalId);
      if (isReservationConflict(error)) {
        await safeAudit(input.dependencies.audit, {
          type: "conversation.workflow.failed",
          scope,
          conversationId: conversation.conversation_id,
          data: { proposal_id: proposal.proposalId, reason: "reservation_conflict" },
        });
        return failure(409, "conflict", "That appointment time is no longer available. Please choose another time.");
      }
      throw error;
    }
  } catch {
    await safeAudit(input.dependencies.audit, { type: "conversation.workflow.failed", scope });
    return failure(503, "storage_unavailable", "Booking confirmation is temporarily unavailable.", true);
  }
}

async function prepareProposal(scope: ExperienceScope, conversation: ConversationResponse, booking: PrepareBookingInput, dependencies: ConversationOrchestratorDependencies) {
  if (!booking.service_id) return undefined;
  const bound = await revalidateProposal(scope, booking, dependencies.tools);
  if (!bound) return undefined;
  const proposal: ConversationBookingProposal = {
    proposalId: createProposalId(dependencies.createProposalId),
    conversationId: conversation.conversation_id,
    booking: bound,
    status: "pending",
  };
  await dependencies.state.save(scope, proposal);
  await safeAudit(dependencies.audit, { type: "conversation.proposal.created", scope, conversationId: conversation.conversation_id, data: { proposal_id: proposal.proposalId, service_id: bound.service_id } });
  return proposal;
}

async function revalidateProposal(scope: ExperienceScope, booking: PrepareBookingInput, tools: ConversationBookingTools) {
  if (!booking.service_id) return undefined;
  const service = await tools.getService(scope, booking.service_id);
  if (!service || service.service_id !== booking.service_id || service.name.trim().toLocaleLowerCase() !== booking.service_name.trim().toLocaleLowerCase()) return undefined;
  const availability = await tools.checkAvailability(scope, { serviceId: service.service_id, date: booking.date });
  const bound = bindPreparedBookingToAvailability(booking, {
    service_id: service.service_id,
    service_name: service.name,
    available_slots: availability.slots.map((slot) => ({
      start_time: slot.start_time ?? slot.start_at ?? "",
      end_time: slot.end_time ?? slot.end_at ?? "",
      available_quantity: slot.available_quantity,
      is_available: slot.is_available,
    })),
  });
  if (!bound) return undefined;
  if (service.booking_mode === "appointment") {
    return bindAppointmentPractitioner(scope, service, availability, bound, tools);
  }
  return bindRequiredResources(service, availability, bound);
}

async function bindAppointmentPractitioner(
  scope: ExperienceScope,
  service: ServiceResponse,
  availability: AvailabilityResponse,
  booking: BoundPreparedBooking,
  tools: ConversationBookingTools,
): Promise<ConversationBoundBooking | undefined> {
  if (booking.seats !== 1) return undefined;
  const resources = (availability.resources ?? service.resources ?? [])
    .flatMap((resource) => {
      const staffId = metadataString(resource.metadata, "platform_staff_id");
      return resource.is_active !== false && staffId
        ? [{ resource, staffId }]
        : [];
    })
    .sort((left, right) => (
      left.resource.label.localeCompare(right.resource.label)
      || left.staffId.localeCompare(right.staffId)
    ));

  for (const { resource, staffId } of resources) {
    const staffAvailability = await tools.checkAvailability(scope, {
      serviceId: service.service_id,
      date: booking.date,
      staffId,
    });
    const slot = staffAvailability.slots.find((candidate) => (
      candidate.is_available
      && candidate.staff_id === staffId
      && (candidate.start_time ?? candidate.start_at) === booking.start_time
      && (candidate.end_time ?? candidate.end_at) === booking.end_time
      && candidate.available_quantity >= booking.seats
      && !(candidate.taken_resource_labels ?? []).includes(resource.label)
      && !(candidate.maintenance_resource_labels ?? []).includes(resource.label)
    ));
    if (!slot) continue;
    return {
      ...booking,
      staff_id: staffId,
      practitioner_name: resource.label,
      resource_ids: [resource.resource_id],
      reservation_items: [{
        resource_id: resource.resource_id,
        resource_label: resource.label,
        quantity: 1,
      }],
    };
  }
  return undefined;
}

function bindRequiredResources(
  service: ServiceResponse,
  availability: AvailabilityResponse,
  booking: BoundPreparedBooking,
): ConversationBoundBooking | undefined {
  const requiresResources = service.resource_strategy === "assigned_resource" || service.resource_kind === "room";
  if (!requiresResources) return booking;

  const slot = availability.slots.find((candidate) => (
    candidate.is_available
    && (candidate.start_time ?? candidate.start_at) === booking.start_time
    && (candidate.end_time ?? candidate.end_at) === booking.end_time
  ));
  if (!slot) return undefined;
  const unavailable = new Set([
    ...(slot.taken_resource_labels ?? []),
    ...(slot.maintenance_resource_labels ?? []),
  ]);
  const resources = (availability.resources ?? service.resources ?? []).filter((resource) => (
    resource.is_active !== false && !unavailable.has(resource.label)
  ));
  const selected: ReservationItemInput[] = [];
  let remaining = booking.seats;
  for (const resource of resources) {
    if (remaining <= 0) break;
    const capacity = Math.max(1, resource.capacity ?? 1);
    if (service.resource_kind === "room" && capacity < booking.seats) continue;
    const quantity = service.resource_kind === "room" ? booking.seats : Math.min(capacity, remaining);
    selected.push({ resource_id: resource.resource_id, resource_label: resource.label, quantity });
    remaining -= quantity;
    if (service.resource_kind === "room") break;
  }
  if (remaining > 0) return undefined;
  return {
    ...booking,
    resource_ids: selected.flatMap((item) => item.resource_id ? [item.resource_id] : []),
    reservation_items: selected,
  };
}

function reservationInput(booking: ConversationBoundBooking, channel: ConversationChannel): CreateReservationInput {
  return {
    service_id: booking.service_id,
    date: booking.date,
    start_time: booking.start_time,
    end_time: booking.end_time,
    quantity: booking.seats,
    ...(booking.staff_id ? { staff_id: booking.staff_id } : {}),
    ...(booking.resource_ids ? { resource_ids: booking.resource_ids } : {}),
    ...(booking.reservation_items ? { reservation_items: booking.reservation_items } : {}),
    customer: { name: booking.user_name, email: booking.user_email, phone: booking.user_phone },
    source: channel,
    metadata: { conversational_booking: true },
  };
}

function metadataString(metadata: ServiceResponse["metadata"], key: string) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isReservationConflict(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { status?: unknown; code?: unknown };
  return candidate.status === 409 || candidate.code === "conflict";
}

function createProposalId(factory?: () => string) {
  const id = (factory?.() ?? globalThis.crypto?.randomUUID?.())?.trim();
  if (!id) throw new Error("Proposal id generation is unavailable.");
  return id;
}

function normalizeScope(scope: ExperienceScope): ExperienceScope | undefined {
  const tenantId = scope.tenantId.trim();
  const venueId = scope.venueId.trim();
  return tenantId && venueId ? { tenantId, venueId } : undefined;
}

function failure(status: number, code: PlatformErrorCode, message: string, retryable = false): ConversationOrchestratorResult {
  return {
    status,
    body: {
      error: {
        code,
        message,
        status,
        ...(retryable ? { retryable: true } : {}),
      },
    },
  };
}

async function safeAudit(sink: ConversationOrchestratorAuditSink | undefined, event: Parameters<ConversationOrchestratorAuditSink["record"]>[0]) {
  try { await sink?.record(event); } catch { /* Audit must not alter booking behavior. */ }
}

export class InMemoryConversationBookingStateStore implements ConversationBookingStateStore {
  readonly proposals = new Map<string, ConversationBookingProposal>();
  async save(scope: ExperienceScope, proposal: ConversationBookingProposal) { this.proposals.set(key(scope, proposal.proposalId), structuredClone(proposal)); }
  async load(scope: ExperienceScope, proposalId: string) { const value = this.proposals.get(key(scope, proposalId)); return value ? structuredClone(value) : undefined; }
  async loadLatestActive(scope: ExperienceScope, conversationId: string) {
    const prefix = `${scope.tenantId}\u0000${scope.venueId}\u0000`;
    const value = [...this.proposals.entries()].reverse().find(([proposalKey, proposal]) => (
      proposalKey.startsWith(prefix)
      && proposal.conversationId === conversationId
      && proposal.status !== "confirmed"
    ))?.[1];
    return value ? structuredClone(value) : undefined;
  }
  async claim(scope: ExperienceScope, proposalId: string) {
    const proposal = this.proposals.get(key(scope, proposalId));
    if (!proposal) return undefined;
    if (proposal.status === "confirmed") return proposal.reservation;
    if (proposal.status === "confirming") return "in_progress" as const;
    proposal.status = "confirming";
    return "claimed" as const;
  }
  async release(scope: ExperienceScope, proposalId: string) { const proposal = this.proposals.get(key(scope, proposalId)); if (proposal?.status === "confirming") proposal.status = "pending"; }
  async complete(scope: ExperienceScope, proposalId: string, reservation: ReservationResponse) { const proposal = this.proposals.get(key(scope, proposalId)); if (!proposal) throw new Error("Proposal not found."); proposal.status = "confirmed"; proposal.reservation = structuredClone(reservation); }
}

function key(scope: ExperienceScope, proposalId: string) { return `${scope.tenantId}\u0000${scope.venueId}\u0000${proposalId}`; }
