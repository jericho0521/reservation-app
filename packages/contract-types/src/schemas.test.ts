import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  acceptStaffInvitationInputSchema,
  authenticatedSessionSchema,
  chatConfirmReservationInputSchema,
  chatCreateReservationSessionInputSchema,
  chatMessageResponseSchema,
  createFirstOwnerInputSchema,
  createReservationInputSchema,
  conversationAutomationInputSchema,
  conversationResponseSchema,
  conversationStaffReplyInputSchema,
  experienceDraftInputSchema,
  experienceIdentityInputSchema,
  experienceOperatingHoursInputSchema,
  experienceKnowledgeInputSchema,
  experienceChannelSettingsResponseSchema,
  experienceResourceInputSchema,
  experienceServiceInputSchema,
  experienceWorkspaceResponseSchema,
  listReservationsResponseSchema,
  loginInputSchema,
  completePasswordResetInputSchema,
  platformErrorBodySchema,
  platformErrorCodeSchema,
  metadataRecordSchema,
  platformErrorResponseSchema,
  publicContractOperations,
  publicExperienceResponseSchema,
  publicChatConversationResponseSchema,
  publicChatMessageInputSchema,
  reservationResponseSchema,
  resourceLayoutResponseSchema,
  rescheduleReservationInputSchema,
  requestPasswordResetInputSchema,
  serviceResponseSchema,
  setupStatusResponseSchema,
  staffInvitationInputSchema,
  staffInvitationResponseSchema,
} from "./index.js";

test("authentication contracts validate setup, sessions, staff, and password resets", () => {
  const owner = {
    setup_token: "s".repeat(43),
    email: "owner@example.com",
    display_name: "Owner",
    password: "correct horse battery staple",
  };
  const session = {
    user_id: "11111111-1111-4111-8111-111111111111",
    tenant_id: "tenant_1",
    role: "owner",
    venue_ids: ["22222222-2222-4222-8222-222222222222"],
    expires_at: "2026-07-15T12:00:00.000Z",
  };

  assert.equal(setupStatusResponseSchema.safeParse({ setup_available: true }).success, true);
  assert.equal(createFirstOwnerInputSchema.safeParse(owner).success, true);
  assert.equal(createFirstOwnerInputSchema.safeParse({ ...owner, password: "too-short" }).success, false);
  assert.equal(loginInputSchema.safeParse({ email: owner.email, password: "anything" }).success, true);
  assert.equal(authenticatedSessionSchema.safeParse(session).success, true);
  assert.equal(authenticatedSessionSchema.safeParse({ ...session, session_token: "secret" }).success, false);

  const invitation = {
    email: "staff@example.com",
    display_name: "Staff Member",
    venue_ids: ["22222222-2222-4222-8222-222222222222"],
  };
  assert.equal(staffInvitationInputSchema.safeParse(invitation).success, true);
  assert.equal(staffInvitationInputSchema.safeParse({ ...invitation, venue_ids: [] }).success, false);
  assert.equal(staffInvitationResponseSchema.safeParse({
    user_id: "33333333-3333-4333-8333-333333333333",
    invitation_token: "i".repeat(43),
    expires_at: "2026-07-16T00:00:00.000Z",
  }).success, true);
  assert.equal(acceptStaffInvitationInputSchema.safeParse({
    display_name: "Staff Member",
    password: "correct horse battery staple",
  }).success, true);

  assert.equal(requestPasswordResetInputSchema.safeParse({ email: owner.email }).success, true);
  assert.equal(completePasswordResetInputSchema.safeParse({ password: "correct horse battery staple" }).success, true);
  assert.equal(completePasswordResetInputSchema.safeParse({ password: "too-short" }).success, false);
});

test("platform error codes include payload_too_large", async () => {
  assert.equal(platformErrorCodeSchema.parse("payload_too_large"), "payload_too_large");

  const artifact = JSON.parse(
    await readFile(new URL("../contracts/json-schema/platform-error-code.schema.json", import.meta.url), "utf8"),
  ) as { $defs?: { PlatformErrorCode?: { anyOf?: Array<{ enum?: string[] }> } } };
  assert.equal(
    artifact.$defs?.PlatformErrorCode?.anyOf?.some((schema) => schema.enum?.includes("payload_too_large")) ?? false,
    true,
  );
  assert.equal(platformErrorCodeSchema.parse("compatible_extension_code"), "compatible_extension_code");
});

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

test("conversation contracts expose display-safe participants and strict takeover inputs", () => {
  const conversation = {
    conversation_id: "conversation_1",
    tenant_id: "tenant_1",
    venue_id: "venue_1",
    channel: "whatsapp",
    status: "active",
    automation_state: "automated",
    participant: { participant_id: "participant_1", role: "customer", display_name: "Alex", contact_hint: "***1234" },
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
  };
  assert.equal(conversationResponseSchema.safeParse(conversation).success, true);
  assert.equal(conversationResponseSchema.safeParse({ ...conversation, participant: { ...conversation.participant, channel_identifier: "+60123456789" } }).success, false);
  assert.equal(conversationAutomationInputSchema.safeParse({ automation_state: "manual" }).success, true);
  assert.equal(conversationAutomationInputSchema.safeParse({ automation_state: "manual", unexpected: true }).success, false);
  assert.equal(conversationStaffReplyInputSchema.safeParse({ content: "  " }).success, false);
});

test("public chat contracts require opaque threads and omit private conversation scope", () => {
  assert.equal(publicChatMessageInputSchema.safeParse({ thread_id: "thread_123", content: "Find a slot" }).success, true);
  assert.equal(publicChatMessageInputSchema.safeParse({ thread_id: "short", content: "Find a slot" }).success, false);
  const response = {
    conversation_id: "conversation_1",
    automation_state: "automated",
    message: {
      message_id: "message_1",
      conversation_id: "conversation_1",
      channel: "web_chat",
      direction: "outbound",
      sender_type: "automation",
      delivery_state: "sent",
      content: "How can I help?",
      created_at: "2026-08-01T00:00:00.000Z",
    },
  };
  assert.equal(publicChatConversationResponseSchema.safeParse(response).success, true);
  assert.equal(publicChatConversationResponseSchema.safeParse({ ...response, tenant_id: "tenant_private" }).success, false);
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

test("experience knowledge and channel readiness stay structured and bounded", () => {
  assert.equal(experienceKnowledgeInputSchema.safeParse({
    question: "Where should I park?",
    answer: "Use the north entrance.",
    source: "Owner FAQ",
  }).success, true);
  assert.equal(experienceKnowledgeInputSchema.safeParse({ question: "", answer: "A" }).success, false);
  assert.equal(experienceChannelSettingsResponseSchema.safeParse({
    channels: { web_booking: true, web_chat: false, whatsapp: true },
    readiness: {
      web_booking: { desired_enabled: true, configured: true, ready: true, state: "ready" },
      web_chat: { desired_enabled: false, configured: false, ready: false, state: "not_configured" },
      whatsapp: { desired_enabled: true, configured: true, ready: false, state: "degraded" },
    },
  }).success, true);
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
    "GET /v1/setup/status",
    "POST /v1/setup/owner",
    "POST /v1/auth/login",
    "POST /v1/auth/logout",
    "GET /v1/auth/session",
    "POST /v1/auth/staff/invitations",
    "POST /v1/auth/staff/invitations/{token}/accept",
    "POST /v1/auth/password-reset",
    "POST /v1/auth/password-reset/{token}/complete",
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
    "GET /v1/operations/overview",
    "GET /v1/analytics",
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
  assert.deepEqual(
    openapi.default.paths["/v1/auth/session"].get.security,
    [{ cookieAuth: [] }],
  );
  assert.equal(
    "content" in openapi.default.paths["/v1/auth/logout"].post.responses["204"],
    false,
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
