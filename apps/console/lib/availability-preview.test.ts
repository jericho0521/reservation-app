import assert from "node:assert/strict";
import test from "node:test";
import { createAvailabilityPreviewSlots } from "./availability-preview.js";

test("availability preview computes interval starts that fit the service duration", () => {
  assert.deepEqual(createAvailabilityPreviewSlots([
    { start_time: "09:00", end_time: "11:00" },
  ], 30, 60), [
    "09:00–10:00",
    "09:30–10:30",
    "10:00–11:00",
  ]);
});

test("availability preview returns no slots for closed days or unusable intervals", () => {
  assert.deepEqual(createAvailabilityPreviewSlots([], 30, 60), []);
  assert.deepEqual(createAvailabilityPreviewSlots([{ start_time: "09:00", end_time: "09:30" }], 30, 60), []);
});
