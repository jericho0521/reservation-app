import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeExperienceOperatingHours,
  readExperienceOperatingHours,
  replaceExperienceOperatingHours,
  type OperatingHoursRepository,
} from "./operating-hours.js";

const scope = { tenantId: "tenant_1", venueId: "venue_1" };
const validInput = {
  timezone: "Asia/Kuala_Lumpur",
  booking_horizon_days: 60,
  slot_interval_minutes: 30,
  minimum_notice_minutes: 120,
  intervals: [
    { day_of_week: 2, start_time: "13:00", end_time: "17:00" },
    { day_of_week: 1, start_time: "09:00", end_time: "12:00" },
  ],
  closures: [{ date: "2026-08-31", reason: "Public holiday" }],
};

test("operating hours normalize deterministic order and reject overlap", () => {
  const normalized = normalizeExperienceOperatingHours(validInput);
  assert.equal(normalized.ok, true);
  if (normalized.ok) assert.deepEqual(normalized.value.intervals.map((interval) => interval.day_of_week), [1, 2]);

  const overlapping = normalizeExperienceOperatingHours({
    ...validInput,
    intervals: [
      { day_of_week: 1, start_time: "09:00", end_time: "12:00" },
      { day_of_week: 1, start_time: "11:30", end_time: "14:00" },
    ],
  });
  assert.equal(overlapping.ok, false);
  if (!overlapping.ok) assert.equal(overlapping.error.error.code, "validation_failed");
});

test("operating hours reject duplicate closures and invalid timezone before repository work", async () => {
  let writes = 0;
  const repository = fakeRepository({
    replace: async () => {
      writes += 1;
      return { data: null };
    },
  });

  const duplicate = await replaceExperienceOperatingHours({
    scope,
    value: { ...validInput, closures: [{ date: "2026-08-31" }, { date: "2026-08-31" }] },
    repository,
  });
  const timezone = await replaceExperienceOperatingHours({
    scope,
    value: { ...validInput, timezone: "Mars/Base" },
    repository,
  });

  assert.equal(duplicate.status, 400);
  assert.equal(timezone.status, 400);
  assert.equal(writes, 0);
});

test("missing operating hours return an editable empty venue default", async () => {
  const result = await readExperienceOperatingHours({ scope, repository: fakeRepository() });
  assert.deepEqual(result, {
    status: 200,
    body: {
      tenant_id: "tenant_1",
      venue_id: "venue_1",
      timezone: "UTC",
      booking_horizon_days: 60,
      slot_interval_minutes: 60,
      minimum_notice_minutes: 0,
      intervals: [],
      closures: [],
    },
  });
});

test("operating hours replacement forwards normalized scoped values", async () => {
  let observed: unknown;
  const result = await replaceExperienceOperatingHours({
    scope,
    value: validInput,
    repository: fakeRepository({
      replace: async (actualScope, value) => {
        observed = { scope: actualScope, value };
        return { data: { tenant_id: actualScope.tenantId, venue_id: actualScope.venueId, ...value } };
      },
    }),
  });

  assert.equal(result.status, 200);
  assert.deepEqual((observed as { value: { intervals: unknown[] } }).value.intervals, [
    { day_of_week: 1, start_time: "09:00", end_time: "12:00" },
    { day_of_week: 2, start_time: "13:00", end_time: "17:00" },
  ]);
});

function fakeRepository(overrides: Partial<OperatingHoursRepository> = {}): OperatingHoursRepository {
  return {
    read: async () => ({ data: null }),
    replace: async (actualScope, value) => ({
      data: { tenant_id: actualScope.tenantId, venue_id: actualScope.venueId, ...value },
    }),
    ...overrides,
  };
}
