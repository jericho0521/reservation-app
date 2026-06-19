import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { GET } from "./route";

test("GET /api/v1/availability returns platform error shape for missing params", async () => {
  const response = await GET(new Request("http://localhost/api/v1/availability"));

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: {
      code: "validation_failed",
      message: "service_id and date are required.",
      status: 400,
    },
  });
});

test("GET /api/v1/availability does not delegate to legacy availability route", async () => {
  const source = await readFile(new URL("./route.ts", import.meta.url), "utf8");

  assert.doesNotMatch(source, /app\/api\/availability\/route/);
  assert.doesNotMatch(source, /@\/lib\/supabase/);
  assert.doesNotMatch(source, /@\/lib\/supabase-admin/);
  assert.match(source, /createPlatformAvailabilityRepository/);
});

test("GET /api/v1/availability keeps orchestration in the platform API package", async () => {
  const source = await readFile(new URL("./route.ts", import.meta.url), "utf8");

  assert.match(source, /listAvailability/);
  assert.doesNotMatch(source, /prepareAvailabilityQuery/);
  assert.doesNotMatch(source, /generateAvailabilityTimeSlots/);
  assert.doesNotMatch(source, /toPlatformAvailabilityResponse/);
  assert.doesNotMatch(source, /getAvailabilityMetadata/);
  assert.doesNotMatch(source, /getLegacyFallbackLabels/);
  assert.doesNotMatch(source, /platformJsonError/);
  assert.doesNotMatch(source, /status === 404/);
  assert.doesNotMatch(source, /@project-play\/reservations-core/);
  assert.doesNotMatch(source, /@project-play\/reservations-supabase/);
});
