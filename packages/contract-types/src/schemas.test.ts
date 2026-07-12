import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  chatConfirmReservationInputSchema,
  chatCreateReservationSessionInputSchema,
  chatMessageResponseSchema,
  createReservationInputSchema,
  experienceDraftInputSchema,
  experienceIdentityInputSchema,
  experienceOperatingHoursInputSchema,
  experienceResourceInputSchema,
  experienceServiceInputSchema,
  experienceWorkspaceResponseSchema,
  listReservationsResponseSchema,
  platformErrorBodySchema,
  metadataRecordSchema,
  platformErrorResponseSchema,
  publicContractOperations,
  publicExperienceResponseSchema,
  reservationResponseSchema,
  resourceLayoutResponseSchema,
  rescheduleReservationInputSchema,
  serviceResponseSchema,
} from "./index.js";

test("experience workspace accepts venue-scoped profile and draft", () => {
  const result = experienceWorkspaceResponseSchema.parse({
    profile: {
      business_id: "business_1",
      tenant_id: "tenant_1",
      venue_id: "venue_1",
      name: "Apex Racing",
      public_slug: "apex-racing",
      preset_id: "racing_gaming",
      status: "draft",
    },
    draft: {
      configuration_id: "config_1",
      business_id: "business_1",
      version: 1,
      state: "draft",
      preset_id: "racing_gaming",
      branding: { brand_name: "Apex Racing", primary_color: "#f59e0b" },
      terminology: { customer: "Driver", resource: "Simulator", booking: "Session" },
      channels: { web_booking: true, web_chat: false, whatsapp: false },
      updated_at: "2026-07-13T00:00:00.000Z",
    },
  });

  assert.equal(result.profile.tenant_id, "tenant_1");
});

test("public experience rejects draft state and private metadata", () => {
  assert.throws(() => publicExperienceResponseSchema.parse({
    profile: {
      business_id: "business_1",
      name: "Apex Racing",
      public_slug: "apex-racing",
      preset_id: "racing_gaming",
    },
    configuration: {
      configuration_id: "config_1",
      business_id: "business_1",
      version: 1,
      state: "draft",
      preset_id: "racing_gaming",
      branding: { brand_name: "Apex Racing" },
      terminology: { customer: "Driver", resource: "Simulator", booking: "Session" },
      channels: { web_booking: true, web_chat: false, whatsapp: false },
      updated_at: "2026-07-13T00:00:00.000Z",
    },
    private_metadata: { secret: "no" },
  }));
});

test("experience draft rejects unknown preset ids", () => {
  assert.throws(() => experienceDraftInputSchema.parse({
    preset_id: "unknown",
    branding: { brand_name: "Demo" },
    terminology: { customer: "Customer", resource: "Resource", booking: "Booking" },
    channels: { web_booking: true, web_chat: false, whatsapp: false },
  }));
});

test("experience identity accepts explicit fields and rejects unsafe slugs", () => {
  const valid = {
    name: "Apex Racing",
    public_slug: "apex-racing",
    branding: { brand_name: "Apex Racing", primary_color: "#f59e0b" },
    terminology: { customer: "Driver", resource: "Simulator", booking: "Session" },
  };
  assert.equal(experienceIdentityInputSchema.safeParse(valid).success, true);
  assert.equal(experienceIdentityInputSchema.safeParse({
    ...valid,
    public_slug: "Apex Racing/../../secret",
  }).success, false);
  assert.equal(experienceIdentityInputSchema.safeParse({
    ...valid,
    unknown: true,
  }).success, false);
});

test("experience catalog inputs enforce usable service and resource values", () => {
  assert.equal(experienceServiceInputSchema.safeParse({
    name: "Racing session",
    duration_minutes: 60,
    total_quantity: 8,
    resource_kind: "station",
    resource_strategy: "assigned_resource",
  }).success, true);
  assert.equal(experienceServiceInputSchema.safeParse({
    name: "",
    duration_minutes: 0,
    total_quantity: -1,
    resource_kind: "unknown",
    resource_strategy: "assigned_resource",
  }).success, false);
  assert.equal(experienceResourceInputSchema.safeParse({
    service_id: "service_1",
    label: "Simulator 1",
    kind: "station",
    capacity: 1,
  }).success, true);
});

test("experience operating hours reject invalid timezones, dates, and overnight intervals", () => {
  const valid = {
    timezone: "Asia/Kuala_Lumpur",
    booking_horizon_days: 60,
    slot_interval_minutes: 30,
    minimum_notice_minutes: 120,
    intervals: [{ day_of_week: 1, start_time: "09:00", end_time: "17:00" }],
    closures: [{ date: "2026-08-31", reason: "Public holiday" }],
  };

  assert.equal(experienceOperatingHoursInputSchema.safeParse(valid).success, true);
  assert.equal(experienceOperatingHoursInputSchema.safeParse({ ...valid, timezone: "Mars/Base" }).success, false);
  assert.equal(experienceOperatingHoursInputSchema.safeParse({
    ...valid,
    intervals: [{ day_of_week: 1, start_time: "22:00", end_time: "02:00" }],
  }).success, false);
  assert.equal(experienceOperatingHoursInputSchema.safeParse({
    ...valid,
    closures: [{ date: "2026-02-30" }],
  }).success, false);
});

test("createReservationInputSchema accepts a minimal reservation intent", () => {
  const result = createReservationInputSchema.parse({
    service_id: "svc_123",
    quantity: 1,
    customer: { name: "Alex" },
  });

  assert.equal(result.service_id, "svc_123");
  assert.equal(result.quantity, 1);
});

test("public contract schemas reject unknown object properties like generated JSON Schema", () => {
  assert.equal(createReservationInputSchema.safeParse({
    service_id: "svc_123",
    quantity: 1,
    customer: { name: "Alex" },
    unexpected: true,
  }).success, false);

  assert.equal(createReservationInputSchema.safeParse({
    service_id: "svc_123",
    quantity: 1,
    customer: { name: "Alex", unexpected: true },
  }).success, false);

  assert.equal(resourceLayoutResponseSchema.safeParse({
    layout_id: "layout_123",
    kind: "grid",
    resources: [{
      resource_id: "res_123",
      unexpected: true,
    }],
  }).success, false);

  assert.equal(platformErrorResponseSchema.safeParse({
    error: {
      code: "bad_request",
      message: "Bad request.",
      status: 400,
      idempotency: {
        status: "rejected",
        unexpected: true,
      },
    },
  }).success, false);
});

test("reservationResponseSchema accepts minimal responses and rejects request-only fields", () => {
  assert.equal(reservationResponseSchema.safeParse({
    reservation_id: "resv_123",
    status: "confirmed",
    service_id: "svc_123",
    quantity: 1,
  }).success, true);

  assert.equal(reservationResponseSchema.safeParse({
    reservation_id: "resv_123",
    status: "confirmed",
    service_id: "svc_123",
    quantity: 1,
    source: "web",
  }).success, false);

  assert.equal(reservationResponseSchema.safeParse({
    reservation_id: "resv_123",
    status: "confirmed",
    service_id: "svc_123",
    quantity: 1,
    unexpected_request_only_field: true,
  }).success, false);
});

test("platformErrorResponseSchema preserves public error metadata", () => {
  const result = platformErrorResponseSchema.parse({
    error: {
      code: "missing_idempotency_key",
      message: "Missing idempotency key.",
      status: 400,
      request_id: "req_123",
      retryable: false,
      idempotency: { status: "rejected" },
    },
  });

  assert.equal(result.error.code, "missing_idempotency_key");
  assert.equal(result.error.idempotency?.status, "rejected");
});

test("metadataRecordSchema rejects nested objects to match public metadata contract", () => {
  assert.equal(metadataRecordSchema.safeParse({ nested: { value: "nope" } }).success, false);
});

test("JSON-facing schemas reject non-finite numbers", () => {
  assert.equal(metadataRecordSchema.safeParse({ value: Infinity }).success, false);

  assert.equal(platformErrorBodySchema.safeParse({
    code: "bad_request",
    message: "Bad request.",
    status: 400,
    details: Infinity,
  }).success, false);

  assert.equal(platformErrorBodySchema.safeParse({
    code: "bad_request",
    message: "Bad request.",
    status: 400,
    causes: [{ value: Infinity }],
  }).success, false);

  assert.equal(resourceLayoutResponseSchema.safeParse({
    layout_id: "layout_123",
    kind: "custom",
    resources: [{
      resource_id: "res_123",
      x: Infinity,
      y: 1,
      width: 2,
      height: 3,
    }],
  }).success, false);

  assert.equal(resourceLayoutResponseSchema.safeParse({
    layout_id: "layout_123",
    kind: "custom",
    resources: [{
      resource_id: "res_123",
      x: 1,
      y: 2,
      width: Infinity,
      height: 3,
    }],
  }).success, false);
});

test("platformErrorBodySchema rejects non-json details", () => {
  assert.equal(platformErrorBodySchema.safeParse({
    code: "bad_request",
    message: "Bad request.",
    status: 400,
    details: undefined,
  }).success, true);
  assert.equal(platformErrorBodySchema.safeParse({
    code: "bad_request",
    message: "Bad request.",
    status: 400,
    details: () => "not json",
  }).success, false);
});

test("resourceLayoutResponseSchema accepts typed grid resources", () => {
  const result = resourceLayoutResponseSchema.parse({
    layout_id: "layout_123",
    kind: "grid",
    resources: [{
      resource_id: "res_123",
      label: "A1",
      row: 1,
      column: 1,
    }],
  });

  assert.equal(result.resources?.[0]?.resource_id, "res_123");
});

test("serviceResponseSchema accepts resource-aware service contracts", () => {
  const result = serviceResponseSchema.parse({
    service_id: "svc_123",
    name: "Simulator",
    total_quantity: 2,
    resource_kind: "station",
    resource_strategy: "assigned_resource",
    reservation_policy: {
      kind: "assigned_resource",
      selection_mode: "assigned_resource",
      max_quantity: 2,
      require_resource_labels: true,
      allow_partial_capacity: false,
    },
    resources: [{
      resource_id: "res_123",
      label: "Station 1",
      kind: "station",
      is_active: true,
    }],
    layout: {
      layout_id: "layout_123",
      kind: "grid",
      metadata: {
        columns: 2,
      },
    },
  });

  assert.equal(result.total_quantity, 2);
  assert.equal(result.resources?.[0]?.label, "Station 1");
});

test("contract artifact registry covers current public /v1 API and SDK paths", () => {
  const operationKeys = new Set(publicContractOperations.map((operation) => `${operation.method.toUpperCase()} ${operation.path}`));

  for (const key of [
    "GET /v1/metadata",
    "GET /v1/tenants/current",
    "GET /v1/venues",
    "GET /v1/venues/{venue_id}",
    "GET /v1/services",
    "GET /v1/services/{service_id}",
    "GET /v1/resources",
    "GET /v1/resources/{resource_id}",
    "GET /v1/resource-layouts/{layout_id}",
    "GET /v1/availability",
    "GET /v1/reservations",
    "POST /v1/reservations",
    "GET /v1/reservations/{reservation_id}",
    "PATCH /v1/reservations/{reservation_id}",
    "POST /v1/reservations/{reservation_id}/cancel",
    "POST /v1/reservations/{reservation_id}/reschedule",
    "GET /v1/resource-maintenance",
    "POST /v1/resource-maintenance",
    "POST /v1/resource-maintenance/{maintenance_id}/end",
    "POST /v1/chat/reservation-sessions",
    "POST /v1/chat/reservation-sessions/{chat_session_id}/messages",
    "POST /v1/chat/reservation-sessions/{chat_session_id}/messages:stream",
    "POST /v1/chat/reservation-sessions/{chat_session_id}/confirm",
  ]) {
    assert.equal(operationKeys.has(key), true, `${key} should be in the public contract registry`);
  }
});

test("lifecycle and chat schemas accept public SDK payloads", () => {
  assert.equal(rescheduleReservationInputSchema.safeParse({
    start_at: "2026-06-08T12:00:00+08:00",
    end_at: "2026-06-08T13:00:00+08:00",
    quantity: 2,
    reservation_items: [{ resource_id: "res_123", quantity: 1 }],
  }).success, true);

  assert.equal(listReservationsResponseSchema.safeParse({
    reservations: [{
      reservation_id: "resv_123",
      status: "confirmed",
      service_id: "svc_123",
      quantity: 1,
    }],
    summary: {
      total: 10,
      confirmed_today: 4,
    },
  }).success, true);

  assert.equal(chatCreateReservationSessionInputSchema.safeParse({
    service_id: "svc_123",
    customer: { name: "Alex" },
  }).success, true);

  assert.equal(chatMessageResponseSchema.safeParse({
    chat_session_id: "chat_123",
    content: "I found a time.",
    actions: [{ type: "suggest_time", value: "12:00" }],
  }).success, true);

  assert.equal(chatConfirmReservationInputSchema.safeParse({
    reservation_intent_id: "intent_123",
  }).success, true);
});

test("contract-types package is ESM importable from built output", async () => {
  const builtModule = await import("../dist/index.js");

  assert.equal(typeof builtModule.createReservationInputSchema.parse, "function");
  assert.equal(Array.isArray(builtModule.publicContractOperations), true);
});

test("contract artifact subpaths are exported for package consumers", async () => {
  const openapiUrl = import.meta.resolve("@reservation-platform/contract-types/contracts/openapi.json");
  const metadataSchemaUrl = import.meta.resolve(
    "@reservation-platform/contract-types/contracts/json-schema/metadata-response.schema.json",
  );

  assert.match(openapiUrl, /contracts\/openapi\.json$/);
  assert.match(metadataSchemaUrl, /contracts\/json-schema\/metadata-response\.schema\.json$/);

  const openapi = await import("@reservation-platform/contract-types/contracts/openapi.json", {
    with: { type: "json" },
  });
  const metadataSchema = await import(
    "@reservation-platform/contract-types/contracts/json-schema/metadata-response.schema.json",
    { with: { type: "json" } }
  );

  assert.equal(openapi.default.info.title, "Reservation Platform API");
  assert.equal(
    "security" in openapi.default.paths["/v1/public/experiences/{slug}"].get,
    false,
  );
  assert.deepEqual(
    openapi.default.paths["/v1/experience/workspace"].get.security,
    [{ bearerAuth: [] }],
  );
  assert.equal(metadataSchema.default.title, "MetadataResponse");
});

test("contract-types package manifest keeps runtime dependencies minimal", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  ) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  assert.deepEqual(Object.keys(packageJson.dependencies ?? {}).sort(), ["zod"]);
  assert.equal(packageJson.devDependencies?.typescript !== undefined, true);
  assert.equal(packageJson.devDependencies?.tsx !== undefined, true);
});
