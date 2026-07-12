import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createSupabaseOperationsOverviewRepository } from "./operations-overview";

test("operations repository calls one scoped RPC with the exact boundary instant", async () => {
  const calls: unknown[] = [];
  const repository = createSupabaseOperationsOverviewRepository({ async rpc(name, params) { calls.push({ name, params }); return { data: { timezone: "Asia/Kuala_Lumpur" }, error: null }; } });
  const result = await repository.read({ tenantId: "tenant_1", venueId: "venue_1" }, new Date("2026-08-04T16:30:00.000Z"));
  assert.deepEqual(calls, [{ name: "read_platform_operations_overview", params: { p_tenant_id: "tenant_1", p_venue_id: "venue_1", p_now: "2026-08-04T16:30:00.000Z" } }]);
  assert.deepEqual(result.data, { timezone: "Asia/Kuala_Lumpur" });
});

test("operations migration scopes every aggregate and bounds the timeline", async () => {
  const source = await readFile(new URL("../../database/migrations/supabase/000020_operations_analytics_rpc.sql", import.meta.url), "utf8");
  assert.match(source, /venues\.tenant_id = p_tenant_id/u);
  assert.match(source, /venues\.id = p_venue_id/u);
  assert.match(source, /p_now at time zone/u);
  assert.match(source, /limit 20/u);
  assert.match(source, /security definer/u);
});
