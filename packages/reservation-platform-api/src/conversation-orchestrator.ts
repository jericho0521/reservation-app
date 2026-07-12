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
  ReservationResponse,
  ServiceResponse,
} from "@reservation-platform/contract-types";
import type { ConversationCreateInput, ConversationRepository } from "./conversations.js";
import type { ExperienceScope } from "./experience-studio.js";

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
  checkAvailability(scope: ExperienceScope, input: { serviceId: string; date: string }): Promise<AvailabilityResponse>;
  createReservation(scope: ExperienceScope, input: CreateReservationInput, idempotencyKey: string): Promise<ReservationResponse>;
}

export interface ConversationBookingProposal {
  proposalId: string;
  conversationId: string;
  booking: BoundPreparedBooking;
  status: "pending" | "confirming" | "confirmed";
  reservation?: ReservationResponse;
}

export interface ConversationBookingStateStore {
  save(scope: ExperienceScope, proposal: ConversationBookingProposal): Promise<void>;
  load(scope: ExperienceScope, proposalId: string): Promise<ConversationBookingProposal | undefined>;
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
    if (conversation.automation_state === "manual") {
      return { status: 200, body: { conversation, message: inbound.data, automation_suppressed: true } };
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
    const outbound = await input.dependencies.conversations.append(scope, conversation.conversation_id, {
      channel: input.message.channel,
      direction: "outbound",
      senderType: "automation",
      deliveryState: "sent",
      content: replyContent,
      metadata: proposal ? { event: "booking.proposed", proposal_id: proposal.proposalId } : { event: response.supported ? "assistant.reply" : "assistant.unsupported" },
    });
    if (outbound.error || !outbound.data) throw outbound.error ?? new Error("reply unavailable");
    return { status: 200, body: { conversation, message: outbound.data, ...(proposal ? { proposal } : {}) } };
  } catch {
    await safeAudit(input.dependencies.audit, { type: "conversation.workflow.failed", scope });
    return failure(503, "storage_unavailable", "Conversation workflow is temporarily unavailable.", true);
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
      const message = await input.dependencies.conversations.append(scope, conversation.conversation_id, {
        channel: conversation.channel,
        direction: "outbound",
        senderType: "automation",
        deliveryState: "sent",
        content: `Booking confirmed. Reference: ${reservation.reservation_id}`,
        reservationId: reservation.reservation_id,
        metadata: { event: "booking.confirmed", proposal_id: proposal.proposalId },
      });
      if (message.error || !message.data) throw message.error ?? new Error("confirmation message unavailable");
      await safeAudit(input.dependencies.audit, { type: "conversation.reservation.created", scope, conversationId: conversation.conversation_id, data: { proposal_id: proposal.proposalId, reservation_id: reservation.reservation_id } });
      return { status: 200, body: { conversation, message: message.data, proposal: { ...proposal, status: "confirmed", reservation }, reservation } };
    } catch (error) {
      await input.dependencies.state.release(scope, proposal.proposalId);
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
  return bindPreparedBookingToAvailability(booking, {
    service_id: service.service_id,
    service_name: service.name,
    available_slots: availability.slots.map((slot) => ({
      start_time: slot.start_time ?? slot.start_at ?? "",
      end_time: slot.end_time ?? slot.end_at ?? "",
      available_quantity: slot.available_quantity,
      is_available: slot.is_available,
    })),
  }) ?? undefined;
}

function reservationInput(booking: BoundPreparedBooking, channel: ConversationChannel): CreateReservationInput {
  return {
    service_id: booking.service_id,
    date: booking.date,
    start_time: booking.start_time,
    end_time: booking.end_time,
    quantity: booking.seats,
    customer: { name: booking.user_name, email: booking.user_email, phone: booking.user_phone },
    source: channel,
    metadata: { conversational_booking: true },
  };
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
