import assert from "node:assert/strict";
import test from "node:test";
import {
  createSupabaseOperatingHoursRepository,
  RESERVATION_SUPABASE_OPERATING_HOURS_RPCS,
} from "./operating-hours.js";

test("operating hours repository owns scoped read and atomic replace RPC shapes", async () => {
  const calls: Array<{ name: string; args?: Record<string, unknown> }> = [];
  const client = {
    async rpc(name: string, args?: Record<string, unknown>) {
      calls.push({ name, args });
      return { data: { venue_id: "venue_1" }, error: null };
    },
  };
  const repository = createSupabaseOperatingHoursRepository(client);
  const scope = { tenantId: "tenant_1", venueId: "venue_1" };
  const value = {
    timezone: "Asia/Kuala_Lumpur",
    booking_horizon_days: 60,
    slot_interval_minutes: 30,
    minimum_notice_minutes: 120,
    intervals: [{ day_of_week: 1, start_time: "09:00", end_time: "17:00" }],
    closures: [{ date: "2026-08-31" }],
  };

  await repository.read(scope);
  await repository.replace(scope, value);

  assert.deepEqual(calls, [
    {
      name: RESERVATION_SUPABASE_OPERATING_HOURS_RPCS.read,
      args: { p_tenant_id: "tenant_1", p_venue_id: "venue_1" },
    },
    {
      name: RESERVATION_SUPABASE_OPERATING_HOURS_RPCS.replace,
      args: { p_tenant_id: "tenant_1", p_venue_id: "venue_1", p_input: value },
    },
  ]);
});

test("operating hours repository preserves storage errors for application mapping", async () => {
  const storageError = { code: "42501", message: "denied" };
  const repository = createSupabaseOperatingHoursRepository({
    async rpc() {
      return { data: null, error: storageError };
    },
  });

  assert.deepEqual(await repository.read({ tenantId: "tenant_1", venueId: "venue_1" }), {
    data: null,
    error: storageError,
  });
});
