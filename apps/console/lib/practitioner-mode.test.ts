import assert from "node:assert/strict";
import test from "node:test";
import { isActivePractitionerResource, usesPractitionerOperations } from "./practitioner-mode";

test("overview mode follows active service behavior across presets", () => {
  assert.equal(usesPractitionerOperations([
    { booking_mode: "resource", is_active: true },
  ], "classes_workshops"), false);
  assert.equal(usesPractitionerOperations([
    { booking_mode: "appointment", is_active: true },
  ], "custom_preset"), true);
  assert.equal(usesPractitionerOperations([
    { booking_mode: "appointment", is_active: false },
    { booking_mode: "resource", is_active: true },
  ], "appointments_salon"), false);
});

test("overview mode falls back to the appointment preset for legacy or unavailable services", () => {
  assert.equal(usesPractitionerOperations([], "appointments_salon"), true);
  assert.equal(usesPractitionerOperations([{ is_active: true }], "appointments_salon"), true);
  assert.equal(usesPractitionerOperations([], "seat_capacity"), false);
});

test("setup counts only active platform staff resources as practitioners", () => {
  assert.equal(isActivePractitionerResource({ is_active: true, metadata: { platform_staff_id: "staff-1" } }), true);
  assert.equal(isActivePractitionerResource({ metadata: { platform_staff_id: "staff-1" } }), true);
  assert.equal(isActivePractitionerResource({ is_active: false, metadata: { platform_staff_id: "staff-1" } }), false);
  assert.equal(isActivePractitionerResource({ is_active: true, metadata: { kind: "room" } }), false);
});
