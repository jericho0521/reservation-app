import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import type { ConversationBookingProposal } from "@reservation-platform/api";
import {
  createSupabaseConversationBookingStateStore,
  RESERVATION_SUPABASE_CONVERSATION_STATE_RPCS,
  type ConversationStateSupabaseClient,
} from "./conversation-state.js";

const migration = readFileSync(resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../database/migrations/supabase/000034_channel_runtime.sql",
), "utf8");

const scope = { tenantId: "tenant-1", venueId: "22222222-2222-4222-8222-222222222222" };
const proposal: ConversationBookingProposal = {
  proposalId: "11111111-1111-4111-8111-111111111111",
  conversationId: "33333333-3333-4333-8333-333333333333",
  status: "pending",
  booking: {
    service_id: "44444444-4444-4444-8444-444444444444",
    service_name: "Consultation",
    date: "2026-07-20",
    start_time: "10:00:00",
    end_time: "11:00:00",
    seats: 1,
    user_name: "Customer",
    user_email: "customer@example.com",
    user_phone: "+60123456789",
  },
};
const reservation = {
  reservation_id: "55555555-5555-4555-8555-555555555555",
  status: "confirmed",
} as NonNullable<ConversationBookingProposal["reservation"]>;

test("proposal survives store recreation and can be claimed once", async () => {
  const database = fakePersistentClient();
  const firstStore = createSupabaseConversationBookingStateStore(database.client, {
    now: () => new Date("2026-07-15T00:00:00.000Z"),
  });
  const secondStore = createSupabaseConversationBookingStateStore(database.client, {
    now: () => new Date("2026-07-15T00:00:01.000Z"),
  });

  await firstStore.save(scope, proposal);
  assert.deepEqual(await secondStore.load(scope, proposal.proposalId), proposal);
  assert.deepEqual(await Promise.all([
    firstStore.claim(scope, proposal.proposalId),
    secondStore.claim(scope, proposal.proposalId),
  ]), ["claimed", "in_progress"]);
});

test("confirmed proposal is restart-safe and completion rejects a different reservation", async () => {
  const database = fakePersistentClient();
  const firstStore = createSupabaseConversationBookingStateStore(database.client);
  await firstStore.save(scope, proposal);
  assert.equal(await firstStore.claim(scope, proposal.proposalId), "claimed");
  await firstStore.complete(scope, proposal.proposalId, reservation);

  const restored = createSupabaseConversationBookingStateStore(database.client);
  assert.deepEqual(await restored.claim(scope, proposal.proposalId), reservation);
  await restored.complete(scope, proposal.proposalId, reservation);
  await assert.rejects(
    () => restored.complete(scope, proposal.proposalId, { ...reservation, reservation_id: "different" }),
    /Failed to complete/u,
  );
});

test("expired proposals cannot be claimed", async () => {
  const calls: unknown[] = [];
  const store = createSupabaseConversationBookingStateStore({
    async rpc(name, params) {
      calls.push([name, params]);
      return { data: { outcome: "expired" }, error: null };
    },
  });
  assert.equal(await store.claim(scope, proposal.proposalId), undefined);
  assert.equal(calls.length, 1);
});

test("latest active proposal treats PostgREST null composite rows as empty", async () => {
  const store = createSupabaseConversationBookingStateStore({
    async rpc() {
      return {
        data: [{
          tenant_id: null,
          venue_id: null,
          conversation_id: null,
          proposal_id: null,
          booking: null,
          status: null,
          reservation: null,
        }],
        error: null,
      };
    },
  });

  assert.equal(await store.loadLatestActive(scope, proposal.conversationId), undefined);
});

test("adapter maps RPC parameters and hides storage error details", async () => {
  const calls: unknown[] = [];
  const store = createSupabaseConversationBookingStateStore({
    async rpc(name, params) {
      calls.push([name, params]);
      return { data: null, error: { message: "private database detail" } };
    },
  });
  await assert.rejects(() => store.load(scope, proposal.proposalId), {
    message: "Failed to load conversation booking proposal.",
  });
  assert.deepEqual(calls, [[RESERVATION_SUPABASE_CONVERSATION_STATE_RPCS.load, {
    p_tenant_id: scope.tenantId,
    p_venue_id: scope.venueId,
    p_proposal_id: proposal.proposalId,
  }]]);
});

test("channel runtime migration uses row locking, expiry, tenant idempotency, and service-role-only tables", () => {
  assert.match(migration, /create table public\.platform_conversation_booking_proposals/iu);
  assert.match(migration, /create table public\.platform_channel_commands/iu);
  assert.match(migration, /create table public\.platform_channel_outbox/iu);
  assert.match(migration, /create table public\.platform_whatsapp_pairing_state/iu);
  assert.match(migration, /claim_platform_conversation_booking_proposal[\s\S]*for update/iu);
  assert.match(migration, /status = 'expired'[\s\S]*expires_at <= now\(\)/iu);
  assert.match(migration, /unique \(tenant_id, idempotency_key\)/iu);
  assert.match(migration, /revoke all on table public\.platform_channel_outbox from public, anon, authenticated, service_role/iu);
});

function fakePersistentClient(): { client: ConversationStateSupabaseClient } {
  let row: Record<string, unknown> | undefined;
  return {
    client: {
      async rpc(name, params = {}) {
        if (name === RESERVATION_SUPABASE_CONVERSATION_STATE_RPCS.save) {
          row = {
            tenant_id: params.p_tenant_id,
            venue_id: params.p_venue_id,
            conversation_id: params.p_conversation_id,
            proposal_id: params.p_proposal_id,
            booking: params.p_booking,
            status: "pending",
            expires_at: params.p_expires_at,
          };
          return { data: row, error: null };
        }
        if (name === RESERVATION_SUPABASE_CONVERSATION_STATE_RPCS.load) {
          return { data: row, error: null };
        }
        if (name === RESERVATION_SUPABASE_CONVERSATION_STATE_RPCS.claim) {
          if (!row) return { data: null, error: null };
          if (row.status === "confirmed") return { data: { outcome: "confirmed", reservation: row.reservation }, error: null };
          if (row.status === "confirming") return { data: { outcome: "in_progress" }, error: null };
          row.status = "confirming";
          return { data: { outcome: "claimed" }, error: null };
        }
        if (name === RESERVATION_SUPABASE_CONVERSATION_STATE_RPCS.release) {
          if (row?.status === "confirming") row.status = "pending";
          return { data: true, error: null };
        }
        if (name === RESERVATION_SUPABASE_CONVERSATION_STATE_RPCS.complete) {
          if (row?.status === "confirmed" && row.reservation_id !== params.p_reservation_id) {
            return { data: null, error: { code: "23505" } };
          }
          if (!row) return { data: null, error: { code: "P0002" } };
          row.status = "confirmed";
          row.reservation_id = params.p_reservation_id;
          row.reservation = params.p_reservation;
          return { data: row, error: null };
        }
        throw new Error(`Unexpected RPC ${name}`);
      },
    },
  };
}
