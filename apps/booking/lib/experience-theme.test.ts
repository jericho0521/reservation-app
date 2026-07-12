import assert from "node:assert/strict";
import test from "node:test";
import { createExperienceThemeStyle } from "../components/experience-theme.js";

test("validated branding becomes bounded experience CSS properties", () => {
  assert.deepEqual(createExperienceThemeStyle({
    brand_name: "Apex Racing",
    primary_color: "#f59e0b",
    secondary_color: "#111827",
  }), {
    "--experience-primary": "#f59e0b",
    "--experience-secondary": "#111827",
  });
});

test("missing optional colors use accessible defaults", () => {
  assert.deepEqual(createExperienceThemeStyle({ brand_name: "Apex Racing" }), {
    "--experience-primary": "#6d5dfc",
    "--experience-secondary": "#111827",
  });
});
