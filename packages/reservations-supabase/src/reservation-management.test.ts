import assert from "node:assert/strict";
import test from "node:test";
import {
  CANCEL_MANAGED_RESERVATION_RPC,
  READ_MANAGED_RESERVATION_RPC,
  RESERVATION_MANAGEMENT_TOKENS_TABLE,
  createSupabaseReservationManagementRepository,
  type ReservationManagementSupabaseClient,
} from "./reservation-management.js";

test("management repository persists hashes and owns slug-scoped RPC shapes", async () => {
  const calls: unknown[] = [];
  const client: ReservationManagementSupabaseClient = {
    from(table) {
      calls.push(["from", table]);
      const builder = {
        insert(rows: unknown) { calls.push(["insert", rows]); return builder; },
        select(columns?: string) { calls.push(["select", columns]); return builder; },
        async single() { return { data: { id: "token-row" }, error: null }; },
      };
      return builder;
    },
    async rpc(name, params) {
      calls.push(["rpc", name, params]);
      return { data: { ok: true }, error: null };
    },
  };
  const repository = createSupabaseReservationManagementRepository(client);
  const tokenHash = "a".repeat(64);
  await repository.issue({ bookingId: "booking_1", tokenHash, expiresAt: "2027-01-01T00:00:00.000Z" });
  await repository.read({ publicSlug: "luma-studio", tokenHash });
  await repository.cancel({ publicSlug: "luma-studio", tokenHash });

  assert.deepEqual(calls, [
    ["from", RESERVATION_MANAGEMENT_TOKENS_TABLE],
    ["insert", [{ booking_id: "booking_1", token_hash: tokenHash, expires_at: "2027-01-01T00:00:00.000Z" }]],
    ["select", "id"],
    ["rpc", READ_MANAGED_RESERVATION_RPC, { p_public_slug: "luma-studio", p_token_hash: tokenHash }],
    ["rpc", CANCEL_MANAGED_RESERVATION_RPC, { p_public_slug: "luma-studio", p_token_hash: tokenHash }],
  ]);
});
