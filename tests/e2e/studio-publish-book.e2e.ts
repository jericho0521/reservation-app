import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createExperienceDraftFromPreset,
  getExperiencePresetCatalogDefaults,
  validateExperienceDraft,
} from "../../packages/reservation-platform-api/src/experience-presets.ts";

test("fresh final demo seed contains three published flagship Studio experiences", async () => {
  const seed = await readFile("packages/database/seeds/final-demo.sql", "utf8");
  assert.match(seed, /delete from public\.tenants where id = 'final_demo'/u);
  for (const value of ["apex-racing-demo", "harbour-rooms-demo", "luma-appointments-demo"]) assert.match(seed, new RegExp(value, "u"));
  assert.equal((seed.match(/'published'/gu) ?? []).length >= 6, true);
});

test("each flagship Studio preset produces a valid publishable foundation", () => {
  for (const preset of ["racing_gaming", "rooms_facilities", "appointments_salon"] as const) {
    const draft = createExperienceDraftFromPreset(preset);
    assert.equal(validateExperienceDraft(draft).valid, true);
    assert.equal((getExperiencePresetCatalogDefaults(preset)?.resources.length ?? 0) > 0, true);
  }
});

test("published booking route uses shared availability and atomic reservation path", async () => {
  const routes = await readFile("apps/api/src/routes.ts", "utf8");
  assert.match(routes, /handlePublicExperienceAvailabilityRequest/u);
  assert.match(routes, /handlePublicExperienceReservationCreateRequest/u);
  assert.match(routes, /handleIdempotentReservationMutation/u);
});
