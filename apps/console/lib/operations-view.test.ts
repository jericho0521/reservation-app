import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import type { OperationsOverviewResponse } from "@reservation-platform/sdk";
import { buildOperationsAttentionItems } from "./operations-view";

const overview: OperationsOverviewResponse = {
  generated_at: "2026-08-05T00:00:00Z", timezone: "UTC", local_date: "2026-08-05",
  reservations: { today: 0, pending: 0, confirmed: 0, completed: 0, cancelled: 0, timeline: [] },
  resources: { total: 4, available: 3, maintenance: 1 }, conversations: { open: 2, staff_takeover: 1 },
  channel_readiness: {
    web_booking: { desired_enabled: true, configured: true, ready: true, state: "ready" },
    web_chat: { desired_enabled: true, configured: false, ready: false, state: "not_configured", message: "Configure AI." },
    whatsapp: { desired_enabled: false, configured: false, ready: false, state: "not_configured" },
  },
};

test("operations attention prioritizes takeover before maintenance and enabled-channel setup", () => {
  assert.deepEqual(buildOperationsAttentionItems(overview).map((item) => [item.label, item.severity]), [
    ["Staff replies needed", "urgent"], ["Resources under maintenance", "warning"], ["Web chat needs setup", "warning"],
  ]);
});

test("operations attention links pending appointments to the daily queue", () => {
  const items = buildOperationsAttentionItems({ ...overview, reservations: { ...overview.reservations, pending: 2 } });
  assert.deepEqual(items.slice(0, 2).map((item) => [item.label, item.href]), [
    ["Staff replies needed", "/admin/conversations"],
    ["Appointments awaiting confirmation", "/admin/reservations?status=pending"],
  ]);
});

test("healthy empty operations render a positive no-issues state", () => {
  const items = buildOperationsAttentionItems({ ...overview, resources: { total: 0, available: 0, maintenance: 0 }, conversations: { open: 0, staff_takeover: 0 }, channel_readiness: { ...overview.channel_readiness, web_chat: { desired_enabled: false, configured: false, ready: false, state: "not_configured" } } });
  assert.equal(items[0]?.label, "No urgent issues");
});

test("overview has explicit slow-loading and partial-outage states", async () => {
  const [page, loading] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/loading.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(page, /Promise\.allSettled/u);
  assert.match(page, /temporarily unavailable/u);
  assert.match(loading, /Loading operations/u);
});
