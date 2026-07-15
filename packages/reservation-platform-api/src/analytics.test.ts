import assert from "node:assert/strict";
import test from "node:test";
import { readAnalytics } from "./analytics";

function emptyAnalytics() { return {
  generated_at: "2026-08-05T00:00:00Z", timezone: "Asia/Kuala_Lumpur", from_date: "2026-08-01", to_date: "2026-08-05", include_simulation: false,
  totals: { reservations: 0, cancelled: 0, cancellation_rate: 0 }, reservations_by_day: [], reservations_by_status: [], reservations_by_channel: [], channel_performance: [], reservations_by_service: [], popular_slots: [],
  practitioner_utilization: [], locations: [], no_show_rate: 0,
  funnel: { conversations_started: 0, proposal_shown: 0, confirmation_requested: 0, reservations_created: 0 }, automation: { automated_conversations: 0, staff_takeovers: 0, containment_rate: 0, takeover_rate: 0 },
}; }

test("analytics forwards a bounded venue-scoped range and defaults simulation exclusion", async () => {
  let observed: unknown;
  const result = await readAnalytics({ scope: { tenantId: " tenant_1 ", venueId: " venue_1 " }, value: { from: "2026-08-01", to: "2026-08-05" }, repository: { async read(scope, query) { observed = { scope, query }; return { data: emptyAnalytics() }; } } });
  assert.equal(result.status, 200);
  assert.deepEqual(observed, { scope: { tenantId: "tenant_1", venueId: "venue_1" }, query: { from: "2026-08-01", to: "2026-08-05", include_simulation: false } });
  assert.equal("totals" in result.body ? result.body.totals.cancellation_rate : -1, 0);
});

test("analytics accepts the 366-day maximum and simulation inclusion", async () => {
  const data = { ...emptyAnalytics(), from_date: "2026-01-01", to_date: "2027-01-01", include_simulation: true };
  const result = await readAnalytics({ scope: { tenantId: "t", venueId: "v" }, value: { from: "2026-01-01", to: "2027-01-01", include_simulation: true }, repository: { async read() { return { data }; } } });
  assert.equal(result.status, 200);
});

test("analytics rejects reversed, impossible, and overlong date ranges before storage", async () => {
  let calls = 0; const repository = { async read() { calls += 1; return { data: emptyAnalytics() }; } };
  for (const value of [{ from: "2026-08-05", to: "2026-08-01" }, { from: "2026-02-30", to: "2026-03-01" }, { from: "2025-01-01", to: "2026-01-02" }]) {
    assert.equal((await readAnalytics({ scope: { tenantId: "t", venueId: "v" }, value, repository })).status, 400);
  }
  assert.equal(calls, 0);
});
