import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { analyticsDateRange, demandChartPoints, percent } from "./analytics-view";

test("analytics date range preserves valid filters and falls back to the latest 30 days", () => {
  assert.deepEqual(analyticsDateRange({ from: "2026-08-01", to: "2026-08-05" }), { from: "2026-08-01", to: "2026-08-05" });
  assert.deepEqual(analyticsDateRange({ from: "bad", to: "2026-08-05" }, new Date("2026-08-31T12:00:00Z")), { from: "2026-08-02", to: "2026-08-31" });
  assert.deepEqual(analyticsDateRange({}, new Date(2026, 6, 13, 0, 30)), { from: "2026-06-14", to: "2026-07-13" });
});

test("demand chart handles no data and one data point without invalid coordinates", () => {
  assert.deepEqual(demandChartPoints([]), []);
  assert.deepEqual(demandChartPoints([{ date: "2026-08-01", total: 0, confirmed: 0, completed: 0, cancelled: 0 }]), [{ date: "2026-08-01", total: 0, x: 300, y: 180 }]);
  assert.equal(percent(0), "0%");
});

test("analytics supports a one-channel result and exposes the simulation inclusion filter", async () => {
  const [comparisonSource, filterSource] = await Promise.all([
    readFile(new URL("../components/analytics/channel-comparison.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/analytics/date-range-filter.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(comparisonSource, /rows\.map/u);
  assert.match(filterSource, /include_simulation/u);
});
