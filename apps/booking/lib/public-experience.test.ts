import assert from "node:assert/strict";
import test from "node:test";
import {
  PlatformError,
  type PublicExperienceResponse,
  type ReservationPlatformClient,
} from "@reservation-platform/sdk";
import { loadPublicExperience } from "./public-experience.js";

const published: PublicExperienceResponse = {
  profile: {
    business_id: "business_1",
    name: "Apex Racing",
    public_slug: "apex-racing",
    preset_id: "racing_gaming",
  },
  configuration: {
    configuration_id: "configuration_1",
    business_id: "business_1",
    version: 1,
    state: "published",
    preset_id: "racing_gaming",
    branding: { brand_name: "Apex Racing", primary_color: "#f59e0b" },
    terminology: { customer: "Driver", resource: "Simulator", booking: "Session" },
    channels: { web_booking: true, web_chat: false, whatsapp: false },
    updated_at: "2026-07-12T00:00:00.000Z",
    published_at: "2026-07-12T00:00:00.000Z",
  },
};

test("published slugs load the browser-safe public response", async () => {
  const result = await loadPublicExperience(clientReturning(published), "apex-racing");
  assert.deepEqual(result, { found: true, experience: published });
});

for (const state of ["unknown", "draft-only", "archived"] as const) {
  test(`${state} slugs stay indistinguishable as a public not-found result`, async () => {
    const result = await loadPublicExperience(clientFailing(404), `${state}-experience`);
    assert.deepEqual(result, { found: false });
  });
}

test("public experience loading preserves operational failures", async () => {
  await assert.rejects(() => loadPublicExperience(clientFailing(503), "apex-racing"), /Unavailable/u);
});

function clientReturning(value: PublicExperienceResponse) {
  return { getPublicExperience: async () => value } as Pick<ReservationPlatformClient, "getPublicExperience">;
}

function clientFailing(status: number) {
  return {
    getPublicExperience: async () => {
      throw new PlatformError({ code: status === 404 ? "not_found" : "unavailable", message: status === 404 ? "Not found" : "Unavailable", status });
    },
  } as Pick<ReservationPlatformClient, "getPublicExperience">;
}
