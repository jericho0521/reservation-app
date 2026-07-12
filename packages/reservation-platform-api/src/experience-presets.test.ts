import assert from "node:assert/strict";
import test from "node:test";
import {
  createExperienceDraftFromPreset,
  experiencePresets,
  validateExperienceDraft,
} from "./experience-presets.js";

test("registry contains exactly eight unique presets", () => {
  assert.equal(experiencePresets.length, 8);
  assert.equal(new Set(experiencePresets.map((preset) => preset.preset_id)).size, 8);
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
