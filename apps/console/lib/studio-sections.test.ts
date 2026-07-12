import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateStudioProgress,
  calculateWorkspaceStudioProgress,
  getStudioSectionHref,
  sectionForValidationPath,
  studioSections,
} from "./studio-sections.js";

test("Studio sections preserve the approved guided order", () => {
  assert.deepEqual(studioSections.map((section) => section.id), [
    "preset",
    "profile",
    "services",
    "resources",
    "availability",
    "knowledge",
    "branding",
    "publish",
  ]);
  assert.equal(getStudioSectionHref("availability"), "/studio/availability");
});

test("Studio progress combines saved sections with server validation issues", () => {
  const progress = calculateStudioProgress({
    savedSections: ["preset", "profile", "branding"],
    validation: {
      valid: false,
      issues: [{ path: "branding.brand_name", message: "Business name is required." }],
    },
  });

  assert.equal(progress.completed, 2);
  assert.equal(progress.total, 8);
  assert.equal(progress.percent, 25);
  assert.equal(progress.sections.preset, "complete");
  assert.equal(progress.sections.branding, "invalid");
  assert.equal(progress.sections.services, "incomplete");
});

test("a valid fully saved Studio reports complete progress", () => {
  const progress = calculateStudioProgress({
    savedSections: studioSections.map((section) => section.id),
    validation: { valid: true, issues: [] },
  });

  assert.equal(progress.completed, 8);
  assert.equal(progress.percent, 100);
  assert.equal(Object.values(progress.sections).every((status) => status === "complete"), true);
});

test("a published workspace without a pending draft remains complete", () => {
  const progress = calculateWorkspaceStudioProgress({
    hasDraft: false,
    hasPublished: true,
    validation: { valid: false, issues: [{ path: "publish.draft", message: "Save a draft before publishing." }] },
  });
  assert.equal(progress.percent, 100);
  assert.equal(Object.values(progress.sections).every((status) => status === "complete"), true);
});

test("validation paths deep-link to the owning Studio section", () => {
  assert.equal(sectionForValidationPath("availability.intervals"), "availability");
  assert.equal(sectionForValidationPath("channels.whatsapp"), "knowledge");
  assert.equal(sectionForValidationPath("resources.service_1"), "resources");
});
