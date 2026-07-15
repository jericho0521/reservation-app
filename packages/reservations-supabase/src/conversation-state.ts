import type {
  ConversationBookingProposal,
  ConversationBookingStateStore,
  ExperienceScope,
} from "@reservation-platform/api";
import type { ReservationResponse } from "@reservation-platform/contract-types";

type RpcResult = { data: unknown; error: unknown | null };

export interface ConversationStateSupabaseClient {
  rpc(name: string, params?: Record<string, unknown>): Promise<RpcResult>;
}

export interface SupabaseConversationBookingStateOptions {
  proposalTtlSeconds?: number;
  now?: () => Date;
}

export const RESERVATION_SUPABASE_CONVERSATION_STATE_RPCS = {
  save: "save_platform_conversation_booking_proposal",
  load: "load_platform_conversation_booking_proposal",
  loadLatestActive: "load_latest_platform_conversation_booking_proposal",
  claim: "claim_platform_conversation_booking_proposal",
  release: "release_platform_conversation_booking_proposal",
  complete: "complete_platform_conversation_booking_proposal",
} as const;

export function createSupabaseConversationBookingStateStore(
  client: ConversationStateSupabaseClient,
  options: SupabaseConversationBookingStateOptions = {},
): ConversationBookingStateStore {
  const ttlSeconds = options.proposalTtlSeconds ?? 15 * 60;
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 24 * 60 * 60) {
    throw new Error("Conversation proposal TTL must be between 1 and 86400 seconds.");
  }
  const now = options.now ?? (() => new Date());

  return {
    async save(scope, proposal) {
      const expiresAt = new Date(now().getTime() + ttlSeconds * 1000).toISOString();
      const result = await client.rpc(RESERVATION_SUPABASE_CONVERSATION_STATE_RPCS.save, {
        ...scopeParams(scope),
        p_conversation_id: proposal.conversationId,
        p_proposal_id: proposal.proposalId,
        p_booking: proposal.booking,
        p_expires_at: expiresAt,
      });
      assertSucceeded(result, "Failed to save conversation booking proposal.");
    },

    async load(scope, proposalId) {
      const result = await client.rpc(RESERVATION_SUPABASE_CONVERSATION_STATE_RPCS.load, {
        ...scopeParams(scope),
        p_proposal_id: proposalId,
      });
      assertSucceeded(result, "Failed to load conversation booking proposal.");
      const row = firstRecord(result.data);
      return row ? adaptProposal(row) : undefined;
    },

    async loadLatestActive(scope, conversationId) {
      const result = await client.rpc(RESERVATION_SUPABASE_CONVERSATION_STATE_RPCS.loadLatestActive, {
        ...scopeParams(scope),
        p_conversation_id: conversationId,
      });
      assertSucceeded(result, "Failed to load the active conversation booking proposal.");
      const row = firstRecord(result.data);
      return row ? adaptProposal(row) : undefined;
    },

    async claim(scope, proposalId) {
      const result = await client.rpc(RESERVATION_SUPABASE_CONVERSATION_STATE_RPCS.claim, {
        ...scopeParams(scope),
        p_proposal_id: proposalId,
      });
      assertSucceeded(result, "Failed to claim conversation booking proposal.");
      if (result.data === null) return undefined;
      const response = asRecord(result.data, "conversation proposal claim");
      if (response.outcome === "claimed") return "claimed";
      if (response.outcome === "in_progress") return "in_progress";
      if (response.outcome === "expired") return undefined;
      if (response.outcome === "confirmed") {
        return adaptReservation(response.reservation);
      }
      throw new Error("Supabase returned an invalid conversation proposal claim outcome.");
    },

    async release(scope, proposalId) {
      const result = await client.rpc(RESERVATION_SUPABASE_CONVERSATION_STATE_RPCS.release, {
        ...scopeParams(scope),
        p_proposal_id: proposalId,
      });
      assertSucceeded(result, "Failed to release conversation booking proposal.");
    },

    async complete(scope, proposalId, reservation) {
      const result = await client.rpc(RESERVATION_SUPABASE_CONVERSATION_STATE_RPCS.complete, {
        ...scopeParams(scope),
        p_proposal_id: proposalId,
        p_reservation_id: reservation.reservation_id,
        p_reservation: reservation,
      });
      assertSucceeded(result, "Failed to complete conversation booking proposal.");
    },
  };
}

function scopeParams(scope: ExperienceScope) {
  return { p_tenant_id: scope.tenantId, p_venue_id: scope.venueId };
}

function adaptProposal(row: Record<string, unknown>): ConversationBookingProposal {
  const status = row.status;
  if (status !== "pending" && status !== "confirming" && status !== "confirmed") {
    throw new Error("Supabase returned an invalid conversation proposal status.");
  }
  const booking = asRecord(row.booking, "conversation proposal booking");
  return {
    proposalId: requireString(row.proposal_id, "conversation proposal id"),
    conversationId: requireString(row.conversation_id, "conversation proposal conversation id"),
    booking: booking as unknown as ConversationBookingProposal["booking"],
    status,
    ...(status === "confirmed" ? { reservation: adaptReservation(row.reservation) } : {}),
  };
}

function adaptReservation(value: unknown): ReservationResponse {
  const reservation = asRecord(value, "conversation proposal reservation");
  requireString(reservation.reservation_id, "conversation proposal reservation id");
  return reservation as unknown as ReservationResponse;
}

function firstRecord(value: unknown) {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate === null || candidate === undefined
    ? undefined
    : asRecord(candidate, "conversation proposal");
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Supabase returned an invalid ${label}.`);
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Supabase returned an invalid ${label}.`);
  }
  return value;
}

function assertSucceeded(result: RpcResult, message: string) {
  if (result.error) throw new Error(message, { cause: result.error });
}
