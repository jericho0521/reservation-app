import assert from "node:assert/strict";
import test from "node:test";

import { emptyOperationsOverviewData, readOperationsOverview } from "./operations-overview";

const readiness = {
  web_booking: { desired_enabled: true, configured: true, ready: true, state: "ready" as const },
  web_chat: { desired_enabled: true, configured: true, ready: true, state: "ready" as const },
  whatsapp: { desired_enabled: true, configured: false, ready: false, state: "not_configured" as const },
};

test("operations overview delegates the exact instant so storage owns venue timezone boundaries", async () => {
  const now = new Date("2026-08-04T16:30:00.000Z");
  let observed: unknown;
  const result = await readOperationsOverview({
    scope: { tenantId: " tenant_1 ", venueId: " venue_1 " }, now, channelReadiness: readiness,
    repository: { async read(scope, instant) { observed = { scope, instant: instant.toISOString() }; return { data: emptyOperationsOverviewData({ now: instant, timezone: "Asia/Kuala_Lumpur", localDate: "2026-08-05" }) }; } },
  });
  assert.equal(result.status, 200);
  assert.deepEqual(observed, { scope: { tenantId: "tenant_1", venueId: "venue_1" }, instant: "2026-08-04T16:30:00.000Z" });
  assert.equal("local_date" in result.body ? result.body.local_date : "", "2026-08-05");
});

test("operations overview preserves bounded empty aggregates and readiness", async () => {
  const now = new Date("2026-08-05T00:00:00.000Z");
  const result = await readOperationsOverview({
    scope: { tenantId: "tenant_1", venueId: "venue_1" }, now, channelReadiness: readiness,
    repository: { async read() { return { data: emptyOperationsOverviewData({ now, timezone: "UTC", localDate: "2026-08-05" }) }; } },
  });
  assert.equal(result.status, 200);
  assert.deepEqual("reservations" in result.body ? result.body.reservations.timeline : null, []);
  assert.deepEqual("channel_readiness" in result.body ? result.body.channel_readiness : null, readiness);
});

test("operations overview accepts staff-created reservations in today's timeline", async () => {
  const now = new Date("2026-08-05T00:00:00.000Z");
  const data = emptyOperationsOverviewData({ now, timezone: "UTC", localDate: "2026-08-05" });
  data.reservations.timeline.push({
    reservation_id: "reservation_1",
    service_name: "Seat session",
    customer_name: "Alex",
    start_time: "10:00",
    end_time: "11:00",
    quantity: 2,
    status: "confirmed",
    channel: "staff",
  });
  const result = await readOperationsOverview({
    scope: { tenantId: "tenant_1", venueId: "venue_1" }, now, channelReadiness: readiness,
    repository: { async read() { return { data }; } },
  });

  assert.equal(result.status, 200);
  assert.equal("reservations" in result.body ? result.body.reservations.timeline[0]?.channel : undefined, "staff");
});

test("operations overview rejects unbounded or malformed storage responses", async () => {
  const result = await readOperationsOverview({
    scope: { tenantId: "tenant_1", venueId: "venue_1" }, channelReadiness: readiness,
    repository: { async read() { return { data: { reservations: { timeline: Array.from({ length: 21 }, () => ({})) } } }; } },
  });
  assert.equal(result.status, 500);
});
