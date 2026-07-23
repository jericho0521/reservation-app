import assert from "node:assert/strict";
import test from "node:test";
import {
  createExperienceDraftFromPreset,
  experiencePresets,
  getExperiencePresetCatalogDefaults,
  validateExperienceDraft,
} from "./experience-presets.js";

test("registry contains exactly nine unique presets", () => {
  assert.equal(experiencePresets.length, 9);
  assert.equal(new Set(experiencePresets.map((preset) => preset.preset_id)).size, 9);
});

test("seat-capacity preset creates a quantity-based reservation draft", () => {
  assert.deepEqual(createExperienceDraftFromPreset("seat_capacity"), {
    preset_id: "seat_capacity",
    branding: { brand_name: "Seat Capacity", primary_color: "#2563eb" },
    terminology: { customer: "Customer", resource: "Seat", booking: "Reservation" },
    channels: { web_booking: true, web_chat: false, whatsapp: false },
  });
});

test("racing preset creates an assigned-resource draft", () => {
  assert.deepEqual(createExperienceDraftFromPreset("racing_gaming"), {
    preset_id: "racing_gaming",
    branding: { brand_name: "Racing & Gaming", primary_color: "#f59e0b" },
    terminology: { customer: "Driver", resource: "Simulator", booking: "Session" },
    channels: { web_booking: true, web_chat: false, whatsapp: false },
  });
});

test("validation reports exact missing paths", () => {
  assert.deepEqual(validateExperienceDraft({
    preset_id: "rooms_facilities",
    branding: { brand_name: "" },
    terminology: { customer: "Organizer", resource: "", booking: "Meeting" },
    channels: { web_booking: false, web_chat: false, whatsapp: false },
  }), {
    valid: false,
    issues: [
      { path: "branding.brand_name", message: "Business name is required." },
      { path: "terminology.resource", message: "Resource terminology is required." },
      { path: "channels", message: "At least one customer channel must be enabled." },
    ],
  });
});

test("preset drafts are fresh copies and cannot mutate the registry", () => {
  const first = createExperienceDraftFromPreset("appointments_salon");
  first.terminology.resource = "Changed";

  assert.equal(
    createExperienceDraftFromPreset("appointments_salon").terminology.resource,
    "Specialist",
  );
});

test("flagship presets provide usable domain-specific catalog defaults", () => {
  const racing = getExperiencePresetCatalogDefaults("racing_gaming");
  const rooms = getExperiencePresetCatalogDefaults("rooms_facilities");
  const appointments = getExperiencePresetCatalogDefaults("appointments_salon");

  assert.deepEqual(
    [racing?.service.resource_strategy, rooms?.service.resource_strategy, appointments?.service.resource_strategy],
    ["assigned_resource", "hybrid", "assigned_resource"],
  );
  assert.deepEqual(
    [racing?.resources.length, rooms?.resources.map((resource) => resource.capacity), appointments?.service.duration_minutes],
    [8, [4, 8, 12], 45],
  );
  assert.equal(getExperiencePresetCatalogDefaults("sports_courts"), undefined);

  racing!.resources[0]!.label = "Changed";
  assert.equal(getExperiencePresetCatalogDefaults("racing_gaming")!.resources[0]!.label, "Simulator 1");
});
