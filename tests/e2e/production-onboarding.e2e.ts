import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { deriveOnboardingState } from "../../apps/console/lib/onboarding-state.ts";

test("production startup has no automatic final_demo identity or seed", async () => {
  const productionInputs = await Promise.all([
    readFile("compose.production.yml", "utf8"),
    readFile("scripts/production/bootstrap-installation.mjs", "utf8"),
    readFile("scripts/production/install.sh", "utf8"),
    readFile("scripts/production/migrate.mjs", "utf8"),
  ]);
  assert.doesNotMatch(productionInputs.join("\n"), /final_demo|final-demo\.sql/iu);
});

test("onboarding implementation uses platform APIs and derives the production order from records", async () => {
  const [actions, loader, pages] = await Promise.all([
    readFile("apps/console/app/setup/actions.ts", "utf8"),
    readFile("apps/console/lib/onboarding-loader.ts", "utf8"),
    Promise.all([
      "business", "location", "services", "staff", "hours", "channels", "review",
    ].map((step) => readFile(`apps/console/app/setup/${step}/page.tsx`, "utf8"))).then((sources) => sources.join("\n")),
  ]);
  const implementation = `${actions}\n${loader}\n${pages}`;
  for (const apiCall of [
    "configureInstallationBusiness",
    "createExperienceService",
    "createExperienceResource",
    "updateExperienceOperatingHours",
    "updateExperienceChannelSettings",
    "validateExperienceWorkspace",
    "publishExperienceDraft",
  ]) assert.match(implementation, new RegExp(`\\.${apiCall}\\(`, "u"));
  assert.doesNotMatch(implementation, /localStorage|sessionStorage/iu);
  assert.match(loader, /getEmailIntegrationSettings/u);
  assert.match(loader, /emailReady:\s*email\.enabled && email\.configured/u);

  const records = {
    presetId: "seat_capacity",
    ownerCreated: true,
    businessConfigured: false,
    locations: 0,
    activeServices: 0,
    activePractitioners: 0,
    operatingIntervals: 0,
    webBookingReady: false,
    emailReady: false,
    published: false,
  };
  assert.equal(deriveOnboardingState(records).nextStep, "business");
  Object.assign(records, { businessConfigured: true, locations: 1 });
  assert.equal(deriveOnboardingState(records).nextStep, "services");
  records.activeServices = 1;
  assert.equal(deriveOnboardingState(records).nextStep, "hours");
  records.operatingIntervals = 5;
  records.webBookingReady = true;
  const ready = deriveOnboardingState(records);
  assert.equal(ready.nextStep, "review");
  assert.equal(ready.canPublish, true);
  assert.equal(ready.emailDelivery, "phase_3_pending");
  records.published = true;
  assert.equal(deriveOnboardingState(records).complete, true);
});

test("unused installation completes owner-to-public seat-capacity onboarding", async (context) => {
  const apiUrl = process.env.RESERVATION_PRODUCTION_E2E_API_URL?.trim();
  const setupToken = process.env.RESERVATION_PRODUCTION_E2E_SETUP_TOKEN?.trim();
  const databaseUrl = process.env.RESERVATION_PRODUCTION_E2E_DATABASE_URL?.trim();
  if (!apiUrl || !setupToken || !databaseUrl) {
    context.skip("Set the dedicated production onboarding API, setup token, and database URL to run the live proof.");
    return;
  }

  const origin = new URL(apiUrl).origin;
  const slug = `production-onboarding-${Date.now()}`;
  const email = `${slug}@example.invalid`;
  const password = `Onboarding-${Date.now()}-secure`;
  const owner = await fetch(new URL("v1/setup/owner", ensureTrailingSlash(apiUrl)), {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ setup_token: setupToken, email, display_name: "Production Owner", password }),
  });
  assert.equal(owner.status, 201);
  const cookies = readAuthCookies(owner.headers);
  assert.ok(cookies.session);
  assert.ok(cookies.csrf);
  const authHeaders = {
    cookie: `reservation_session=${cookies.session}; reservation_csrf=${cookies.csrf}`,
    origin,
    "x-csrf-token": cookies.csrf,
    "content-type": "application/json",
  };

  const business = await requestJson(apiUrl, "/v1/installation/business", {
    method: "PUT",
    headers: authHeaders,
    body: {
      name: "Production Reservation Venue",
      public_slug: slug,
      timezone: "Asia/Kuala_Lumpur",
      location: { name: "Main location", address: "Production fixture" },
    },
  });
  assert.equal(business.response.status, 200);
  assert.equal((business.body as { profile: { preset_id: string } }).profile.preset_id, "seat_capacity");
  const venueId = String((business.body as { locations: Array<{ location_id: string }> }).locations[0]?.location_id ?? "");
  assert.match(venueId, /^[0-9a-f-]{36}$/u);
  const scopedHeaders = { ...authHeaders, "x-reservation-venue-id": venueId };

  const service = await requestJson(apiUrl, "/v1/experience/services", {
    method: "POST",
    headers: scopedHeaders,
    body: {
      name: "Group Session",
      description: "A production pooled-capacity session.",
      duration_minutes: 60,
      total_quantity: 12,
      resource_kind: "capacity_bucket",
      resource_strategy: "quantity",
    },
  });
  assert.equal(service.response.status, 201);

  const hours = await requestJson(apiUrl, "/v1/experience/operating-hours", {
    method: "PUT",
    headers: scopedHeaders,
    body: {
      timezone: "Asia/Kuala_Lumpur",
      booking_horizon_days: 90,
      slot_interval_minutes: 30,
      minimum_notice_minutes: 60,
      intervals: [1, 2, 3, 4, 5].map((day_of_week) => ({ day_of_week, start_time: "09:00", end_time: "17:00" })),
      closures: [],
    },
  });
  assert.equal(hours.response.status, 200);

  const channels = await requestJson(apiUrl, "/v1/experience/channels", {
    method: "PUT",
    headers: scopedHeaders,
    body: { web_booking: true, web_chat: false, whatsapp: false },
  });
  assert.equal(channels.response.status, 200);

  const validation = await requestJson(apiUrl, "/v1/experience/validation", {
    method: "GET",
    headers: scopedHeaders,
  });
  assert.equal(validation.response.status, 200);
  assert.equal((validation.body as { valid: boolean }).valid, true);
  const workspace = await requestJson(apiUrl, "/v1/experience/workspace", {
    method: "GET",
    headers: scopedHeaders,
  });
  const configurationId = String((workspace.body as { draft: { configuration_id: string } }).draft.configuration_id);
  const publish = await requestJson(apiUrl, "/v1/experience/publish", {
    method: "POST",
    headers: scopedHeaders,
    body: { configuration_id: configurationId },
  });
  assert.equal(publish.response.status, 200);

  const publicExperience = await fetch(new URL(`v1/public/experiences/${slug}`, ensureTrailingSlash(apiUrl)));
  assert.equal(publicExperience.status, 200);
  assert.equal((await publicExperience.json() as { profile: { public_slug: string } }).profile.public_slug, slug);

  const databaseCheck = spawnSync(
    process.env.PSQL_BIN?.trim() || "psql",
    [databaseUrl, "--no-psqlrc", "--tuples-only", "--no-align", "--command", "select count(*) from public.tenants where id = 'final_demo';"],
    { encoding: "utf8" },
  );
  assert.equal(databaseCheck.status, 0, "The dedicated onboarding database must be queryable.");
  assert.equal(databaseCheck.stdout.trim(), "0");
});

async function requestJson(
  baseUrl: string,
  path: string,
  input: { method: string; headers: Record<string, string>; body?: unknown },
) {
  const response = await fetch(new URL(path.replace(/^\//u, ""), ensureTrailingSlash(baseUrl)), {
    method: input.method,
    headers: input.headers,
    ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
  });
  return { response, body: await response.json() as unknown };
}

function ensureTrailingSlash(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}

function readAuthCookies(headers: Headers) {
  const values = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.()
    ?? [headers.get("set-cookie") ?? ""];
  const joined = values.join(",");
  return {
    session: joined.match(/(?:^|,\s*)reservation_session=([^;,\s]+)/u)?.[1],
    csrf: joined.match(/(?:^|,\s*)reservation_csrf=([^;,\s]+)/u)?.[1],
  };
}
