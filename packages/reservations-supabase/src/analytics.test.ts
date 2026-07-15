import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createSupabaseAnalyticsRepository } from "./analytics";

test("analytics repository owns the scoped bounded RPC shape", async () => {
  const calls: unknown[] = [];
  const repository = createSupabaseAnalyticsRepository({ async rpc(name, params) { calls.push({ name, params }); return { data: {}, error: null }; } });
  await repository.read({ tenantId: "tenant_1", venueId: "venue_1" }, { from: "2026-08-01", to: "2026-08-31", include_simulation: false });
  assert.deepEqual(calls, [{ name: "read_platform_analytics", params: { p_tenant_id: "tenant_1", p_venue_id: "venue_1", p_from_date: "2026-08-01", p_to_date: "2026-08-31", p_include_simulation: false } }]);
});

test("appointment analytics SQL is bounded and derives utilization and no-shows from authoritative records", async () => {
  const source = await readFile(new URL("../../database/migrations/supabase/000036_appointment_analytics.sql", import.meta.url), "utf8");
  for (const expected of ["booking.proposed", "booking.confirmation_requested", "booking.confirmed", "at time zone v_timezone", "p_include_simulation", "then 0", "p_to_date - p_from_date > 365", "platform_operating_intervals", "platform_date_closures", "platform_staff_locations", "practitioner_utilization", "no_show_rate", "limit 50"]) assert.equal(source.includes(expected), true, expected);
  assert.doesNotMatch(source, /predict|forecast/iu);
});
