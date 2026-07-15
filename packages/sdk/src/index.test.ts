import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import {
  createIdempotencyKey,
  createPublicExperienceBookingClient,
  createReservationPlatformClient,
  isPlatformError,
} from "./index.js";

test("authentication SDK methods use cookie credentials and omit tokens from session bodies", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const session = {
    user_id: "11111111-1111-4111-8111-111111111111",
    tenant_id: "tenant_1",
    role: "owner",
    venue_ids: [],
    expires_at: "2026-07-15T12:00:00.000Z",
  };
  const client = createReservationPlatformClient({
    baseUrl: "https://platform.example",
    fetch: async (url, init) => {
      requests.push({ url: String(url), init });
      const path = new URL(String(url)).pathname;
      if (path === "/v1/setup/status") return jsonResponse({ setup_available: true });
      if (path === "/v1/auth/staff/invitations") {
        return jsonResponse({
          user_id: "22222222-2222-4222-8222-222222222222",
          invitation_token: "i".repeat(43),
          expires_at: "2026-07-16T00:00:00.000Z",
        });
      }
      if (path === "/v1/auth/staff") return jsonResponse({ staff: [] });
      if (path.includes("/v1/auth/staff/") && init?.method === "PATCH") {
        return jsonResponse({
          user_id: "22222222-2222-4222-8222-222222222222",
          email: "staff@example.com",
          display_name: "Staff",
          status: "disabled",
          venue_ids: ["33333333-3333-4333-8333-333333333333"],
        });
      }
      if (path.endsWith("/password-reset") || path.endsWith("/complete") || path.endsWith("/logout")) {
        return new Response(null, { status: path.endsWith("/password-reset") ? 202 : 204 });
      }
      return jsonResponse(session);
    },
  });

  await client.getSetupStatus();
  await client.createFirstOwner({
    setup_token: "s".repeat(43),
    email: "owner@example.com",
    display_name: "Owner",
    password: "correct horse battery staple",
  });
  await client.login({ email: "owner@example.com", password: "correct horse battery staple" });
  await client.getSession();
  await client.inviteStaff({
    email: "staff@example.com",
    display_name: "Staff",
    venue_ids: ["33333333-3333-4333-8333-333333333333"],
  });
  await client.listStaff();
  await client.updateStaffAccess("staff/id", {
    status: "disabled",
    venue_ids: ["33333333-3333-4333-8333-333333333333"],
  });
  await client.acceptStaffInvitation("opaque/token", {
    display_name: "Staff",
    password: "correct horse battery staple",
  });
  await client.requestPasswordReset({ email: "owner@example.com" });
  await client.completePasswordReset("reset/token", { password: "another correct password" });
  await client.logout();

  assert.deepEqual(requests.map(({ url, init }) => [new URL(url).pathname, init?.method]), [
    ["/v1/setup/status", "GET"],
    ["/v1/setup/owner", "POST"],
    ["/v1/auth/login", "POST"],
    ["/v1/auth/session", "GET"],
    ["/v1/auth/staff/invitations", "POST"],
    ["/v1/auth/staff", "GET"],
    ["/v1/auth/staff/staff%2Fid", "PATCH"],
    ["/v1/auth/staff/invitations/opaque%2Ftoken/accept", "POST"],
    ["/v1/auth/password-reset", "POST"],
    ["/v1/auth/password-reset/reset%2Ftoken/complete", "POST"],
    ["/v1/auth/logout", "POST"],
  ]);
  requests.forEach(({ init }) => assert.equal(init?.credentials, "include"));
  assert.equal(String(requests[1]?.init?.body).includes("session_token"), false);
});

test("onboarding SDK methods use installation and location routes", async () => {
  const requests: Array<{ path: string; method: string; body?: unknown }> = [];
  const location = {
    location_id: "11111111-1111-4111-8111-111111111111",
    name: "City Centre",
    timezone: "Asia/Kuala_Lumpur",
  };
  const client = createReservationPlatformClient({
    baseUrl: "https://platform.example",
    fetch: async (input, init) => {
      const path = new URL(String(input)).pathname;
      requests.push({ path, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (path === "/v1/locations") return jsonResponse(init?.method === "POST" ? location : { locations: [location] });
      if (path.startsWith("/v1/locations/")) return jsonResponse({ ...location, timezone: "UTC" });
      return jsonResponse({
        profile: {
          business_id: "business-1",
          tenant_id: "tenant-1",
          venue_id: location.location_id,
          name: "Northstar Therapy",
          public_slug: "northstar-therapy",
          preset_id: "appointments_salon",
          status: "draft",
        },
        locations: [location],
      });
    },
  });
  const businessInput = {
    name: "Northstar Therapy",
    public_slug: "northstar-therapy",
    timezone: "Asia/Kuala_Lumpur",
    location: { name: "City Centre" },
  };
  await client.getInstallationBusiness();
  await client.configureInstallationBusiness(businessInput);
  await client.listInstallationLocations();
  await client.createInstallationLocation({ name: "City Centre", timezone: "Asia/Kuala_Lumpur" });
  await client.updateInstallationLocation("location/1", { timezone: "UTC" });
  assert.deepEqual(requests.map(({ path, method }) => [path, method]), [
    ["/v1/installation/business", "GET"],
    ["/v1/installation/business", "PUT"],
    ["/v1/locations", "GET"],
    ["/v1/locations", "POST"],
    ["/v1/locations/location%2F1", "PATCH"],
  ]);
  assert.deepEqual(requests[1]?.body, businessInput);
});

test("SDK forwards an explicitly configured credentials mode", async () => {
  let credentials: RequestCredentials | undefined;
  const client = createReservationPlatformClient({
    baseUrl: "https://platform.example",
    credentials: "same-origin",
    fetch: async (_url, init) => {
      credentials = init?.credentials;
      return jsonResponse({ api_version: "v1", modules: [] });
    },
  });

  await client.getMetadata();
  assert.equal(credentials, "same-origin");
});

test("experience SDK methods use scoped owner and public routes", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const workspace = {
    profile: {
      business_id: "business_1",
      tenant_id: "tenant_1",
      venue_id: "venue_1",
      name: "Apex Racing",
      public_slug: "apex-racing",
      preset_id: "racing_gaming",
      status: "draft",
    },
  };
  const client = createReservationPlatformClient({
    baseUrl: "https://platform.example",
    tenantId: "tenant_1",
    venueId: "venue_1",
    getAccessToken: () => "token",
    fetch: async (url, init) => {
      requests.push({ url: String(url), init });
      return jsonResponse(String(url).includes("public/experiences")
        ? {
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
              branding: { brand_name: "Apex Racing" },
              terminology: { customer: "Driver", resource: "Simulator", booking: "Session" },
              channels: { web_booking: true, web_chat: false, whatsapp: false },
              updated_at: "2026-07-13T00:00:00.000Z",
            },
          }
        : workspace);
    },
  });

  await client.getExperienceWorkspace();
  await client.validateExperienceWorkspace();
  await client.saveExperienceDraft({
    preset_id: "racing_gaming",
    branding: { brand_name: "Apex Racing" },
    terminology: { customer: "Driver", resource: "Simulator", booking: "Session" },
    channels: { web_booking: true, web_chat: false, whatsapp: false },
  });
  await client.publishExperienceDraft("configuration_1");
  await client.updateExperienceIdentity({
    name: "Apex Racing",
    public_slug: "apex-racing",
    branding: { brand_name: "Apex Racing" },
    terminology: { customer: "Driver", resource: "Simulator", booking: "Session" },
  });
  await client.getPublicExperience("apex racing");

  assert.equal(requests[0].url, "https://platform.example/v1/experience/workspace");
  assert.equal(new Headers(requests[0].init?.headers).get("X-Reservation-Tenant-Id"), "tenant_1");
  assert.equal(requests[1].url, "https://platform.example/v1/experience/validation");
  assert.equal(requests[2].init?.method, "PUT");
  assert.deepEqual(JSON.parse(String(requests[2].init?.body)), {
    preset_id: "racing_gaming",
    branding: { brand_name: "Apex Racing" },
    terminology: { customer: "Driver", resource: "Simulator", booking: "Session" },
    channels: { web_booking: true, web_chat: false, whatsapp: false },
  });
  assert.equal(requests[3].init?.method, "POST");
  assert.deepEqual(JSON.parse(String(requests[3].init?.body)), {
    configuration_id: "configuration_1",
  });
  assert.equal(
    requests[5].url,
    "https://platform.example/v1/public/experiences/apex%20racing",
  );
  assert.equal(requests[4].init?.method, "PATCH");
  assert.equal(new Headers(requests[5].init?.headers).get("Authorization"), null);
  assert.equal(new Headers(requests[5].init?.headers).get("X-Reservation-Tenant-Id"), null);
});

test("experience catalog SDK methods preserve mutation paths and bodies", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = createReservationPlatformClient({
    baseUrl: "https://platform.example",
    fetch: async (url, init) => {
      requests.push({ url: String(url), init });
      return jsonResponse({});
    },
  });
  const service = {
    name: "Simulator Session",
    duration_minutes: 60,
    total_quantity: 8,
    resource_kind: "station" as const,
    resource_strategy: "assigned_resource" as const,
  };
  const resource = {
    service_id: "service/1",
    label: "Simulator 1",
    kind: "station" as const,
    capacity: 1,
  };

  await client.listExperienceServices();
  await client.createExperienceService(service);
  await client.updateExperienceService("service/1", service);
  await client.archiveExperienceService("service/1", { reason: "Seasonal" });
  await client.listExperienceResources();
  await client.createExperienceResource(resource);
  await client.updateExperienceResource("resource/1", resource);
  await client.archiveExperienceResource("resource/1");

  assert.deepEqual(requests.map(({ url, init }) => [new URL(url).pathname, init?.method]), [
    ["/v1/experience/services", "GET"],
    ["/v1/experience/services", "POST"],
    ["/v1/experience/services/service%2F1", "PUT"],
    ["/v1/experience/services/service%2F1/archive", "POST"],
    ["/v1/experience/resources", "GET"],
    ["/v1/experience/resources", "POST"],
    ["/v1/experience/resources/resource%2F1", "PUT"],
    ["/v1/experience/resources/resource%2F1/archive", "POST"],
  ]);
  assert.deepEqual(JSON.parse(String(requests[1]!.init?.body)), service);
  assert.deepEqual(JSON.parse(String(requests[3]!.init?.body)), { reason: "Seasonal" });
  assert.deepEqual(JSON.parse(String(requests[5]!.init?.body)), resource);
  assert.deepEqual(JSON.parse(String(requests[7]!.init?.body)), {});
});

test("experience operating-hours SDK methods use the owner route", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const value = {
    timezone: "Asia/Kuala_Lumpur",
    booking_horizon_days: 60,
    slot_interval_minutes: 30,
    minimum_notice_minutes: 120,
    intervals: [{ day_of_week: 1, start_time: "09:00", end_time: "17:00" }],
    closures: [{ date: "2026-08-31" }],
  };
  const client = createReservationPlatformClient({
    baseUrl: "https://platform.example",
    fetch: async (url, init) => {
      requests.push({ url: String(url), init });
      return jsonResponse(value);
    },
  });

  await client.getExperienceOperatingHours();
  await client.updateExperienceOperatingHours(value);

  assert.deepEqual(requests.map(({ url, init }) => [new URL(url).pathname, init?.method]), [
    ["/v1/experience/operating-hours", "GET"],
    ["/v1/experience/operating-hours", "PUT"],
  ]);
  assert.deepEqual(JSON.parse(String(requests[1]!.init?.body)), value);
});

test("public booking SDK methods stay slug-scoped and omit owner authorization", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = createReservationPlatformClient({
    baseUrl: "https://platform.example",
    tenantId: "tenant_private",
    venueId: "venue_private",
    getAccessToken: () => "owner-secret",
    fetch: async (url, init) => {
      requests.push({ url: String(url), init });
      return jsonResponse({ services: [] });
    },
  });
  const reservation = {
    service_id: "11111111-1111-4111-8111-111111111111",
    date: "2026-07-20",
    start_time: "09:00",
    end_time: "10:00",
    quantity: 1,
    customer: { name: "Alex" },
  };

  await client.listPublicExperienceServices("apex racing");
  await client.listPublicExperienceAvailability("apex racing", { service_id: reservation.service_id, date: reservation.date });
  await client.createPublicExperienceReservation("apex racing", reservation, { idempotencyKey: "public_12345678" });

  assert.deepEqual(requests.map(({ url, init }) => [new URL(url).pathname, init?.method]), [
    ["/v1/public/experiences/apex%20racing/services", "GET"],
    ["/v1/public/experiences/apex%20racing/availability", "GET"],
    ["/v1/public/experiences/apex%20racing/reservations", "POST"],
  ]);
  for (const request of requests) {
    const headers = new Headers(request.init?.headers);
    assert.equal(headers.has("Authorization"), false);
    assert.equal(headers.has("X-Reservation-Tenant-Id"), false);
    assert.equal(headers.has("X-Reservation-Venue-Id"), false);
  }
  assert.equal(new Headers(requests[2]?.init?.headers).get("Idempotency-Key"), "public_12345678");
});

test("public booking client adapts headless service, availability, and mutation calls", async () => {
  const requests: string[] = [];
  const client = createPublicExperienceBookingClient({
    baseUrl: "https://platform.example",
    slug: "apex-racing",
    fetch: async (url) => {
      requests.push(new URL(String(url)).pathname);
      if (String(url).endsWith("/services")) return jsonResponse({ services: [{ service_id: "service_1", name: "Sprint" }] });
      if (String(url).includes("/availability")) return jsonResponse({ slots: [] });
      return jsonResponse({ reservation_id: "reservation_1", service_id: "service_1", status: "confirmed", quantity: 1 });
    },
  });

  await client.listServices();
  await client.getService("service_1");
  await client.listAvailability({ service_id: "service_1", date: "2026-07-20" });
  await client.createReservation({ service_id: "service_1", date: "2026-07-20", start_time: "09:00", end_time: "10:00", quantity: 1, customer: { name: "Alex" } });

  assert.deepEqual(requests, [
    "/v1/public/experiences/apex-racing/services",
    "/v1/public/experiences/apex-racing/services",
    "/v1/public/experiences/apex-racing/availability",
    "/v1/public/experiences/apex-racing/reservations",
  ]);
});

test("customer management SDK methods encode opaque token paths and stay public", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = createReservationPlatformClient({
    baseUrl: "https://platform.example",
    getAccessToken: () => "owner-secret",
    fetch: async (url, init) => {
      requests.push({ url: String(url), init });
      return jsonResponse({ reservation_id: "reservation_1", service_id: "service_1", status: "confirmed", quantity: 1 });
    },
  });
  await client.getManagedReservation("luma studio", "opaque/token");
  await client.cancelManagedReservation("luma studio", "opaque/token");
  await client.rescheduleManagedReservation("luma studio", "opaque/token", {
    date: "2026-08-02",
    start_time: "10:30",
    staff_id: "33333333-3333-4333-8333-333333333333",
  });
  assert.deepEqual(requests.map(({ url, init }) => [new URL(url).pathname, init?.method]), [
    ["/v1/public/experiences/luma%20studio/manage/opaque%2Ftoken", "GET"],
    ["/v1/public/experiences/luma%20studio/manage/opaque%2Ftoken/cancel", "POST"],
    ["/v1/public/experiences/luma%20studio/manage/opaque%2Ftoken/reschedule", "POST"],
  ]);
  requests.forEach((request) => assert.equal(new Headers(request.init?.headers).has("Authorization"), false));
});

test("conversation SDK methods preserve scoped owner paths, filters, and bodies", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = createReservationPlatformClient({
    baseUrl: "https://platform.example",
    tenantId: "tenant_1",
    venueId: "venue_1",
    fetch: async (url, init) => {
      requests.push({ url: String(url), init });
      return jsonResponse({ conversations: [], messages: [] });
    },
  });

  await client.listConversations({ channel: "whatsapp", status: "active", limit: 25 });
  await client.getConversation("conversation/1");
  await client.listConversationMessages("conversation/1", { before: "2026-08-01T00:00:00.000Z", limit: 10 });
  await client.sendConversationStaffReply("conversation/1", { content: "I can help with that." });
  await client.updateConversationAutomation("conversation/1", { automation_state: "manual" });

  assert.deepEqual(requests.map(({ url, init }) => [new URL(url).pathname, init?.method]), [
    ["/v1/conversations", "GET"],
    ["/v1/conversations/conversation%2F1", "GET"],
    ["/v1/conversations/conversation%2F1/messages", "GET"],
    ["/v1/conversations/conversation%2F1/messages", "POST"],
    ["/v1/conversations/conversation%2F1/automation", "PUT"],
  ]);
  assert.equal(new URL(requests[0]!.url).search, "?channel=whatsapp&status=active&limit=25");
  assert.equal(new URL(requests[2]!.url).search, "?before=2026-08-01T00%3A00%3A00.000Z&limit=10");
  assert.deepEqual(JSON.parse(String(requests[3]!.init?.body)), { content: "I can help with that." });
  assert.deepEqual(JSON.parse(String(requests[4]!.init?.body)), { automation_state: "manual" });
});

test("operations overview SDK uses the scoped owner endpoint", async () => {
  const requests: string[] = [];
  const client = createReservationPlatformClient({
    baseUrl: "https://platform.example", tenantId: "tenant_1", venueId: "venue_1",
    fetch: async (url) => { requests.push(String(url)); return jsonResponse({}); },
  });
  await client.getOperationsOverview();
  assert.equal(new URL(requests[0]!).pathname, "/v1/operations/overview");
});

test("analytics SDK serializes the bounded range and simulation toggle", async () => {
  let requested = "";
  const client = createReservationPlatformClient({ baseUrl: "https://platform.example", fetch: async (url) => { requested = String(url); return jsonResponse({}); } });
  await client.getAnalytics({ from: "2026-08-01", to: "2026-08-31", include_simulation: true });
  const url = new URL(requested);
  assert.equal(url.pathname, "/v1/analytics");
  assert.equal(url.search, "?from=2026-08-01&to=2026-08-31&include_simulation=true");
});

test("WhatsApp owner SDK methods keep readiness, QR, and simulation behind scoped authenticated routes", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = createReservationPlatformClient({
    baseUrl: "https://platform.example",
    tenantId: "tenant_1",
    venueId: "venue_1",
    getAccessToken: () => "owner-secret",
    fetch: async (url, init) => { requests.push({ url: String(url), init }); return jsonResponse({}); },
  });
  await client.getWhatsAppReadiness();
  await client.startWhatsAppSession();
  await client.getWhatsAppSessionStatus();
  await client.getWhatsAppSessionQr();
  await client.logoutWhatsAppSession();
  await client.simulateWhatsAppMessage({ text: "Book a room", message_id: "demo-step-1" });
  assert.deepEqual(requests.map(({ url, init }) => [new URL(url).pathname, init?.method]), [
    ["/v1/channels/whatsapp/readiness", "GET"],
    ["/v1/channels/whatsapp/session/start", "POST"],
    ["/v1/channels/whatsapp/session/status", "GET"],
    ["/v1/channels/whatsapp/session/qr", "GET"],
    ["/v1/channels/whatsapp/session/logout", "POST"],
    ["/v1/channels/whatsapp/messages:simulate", "POST"],
  ]);
  requests.forEach(({ init }) => assert.equal(new Headers(init?.headers).get("authorization"), "Bearer owner-secret"));
  assert.deepEqual(JSON.parse(String(requests[5]!.init?.body)), { text: "Book a room", message_id: "demo-step-1" });
});

test("public chat SDK methods stay slug scoped and omit owner credentials", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = createReservationPlatformClient({
    baseUrl: "https://platform.example",
    tenantId: "private",
    getAccessToken: () => "owner-secret",
    fetch: async (url, init) => { requests.push({ url: String(url), init }); return jsonResponse({ conversation_id: "conversation_1", automation_state: "automated", messages: [] }); },
  });
  await client.sendPublicChatMessage("apex racing", { thread_id: "thread_123", content: "Hello" });
  await client.listPublicChatMessages("apex racing", "conversation/1", { limit: 20 });
  await client.confirmPublicChatBooking("apex racing", "conversation/1", { proposal_id: "proposal_1" });
  assert.deepEqual(requests.map(({ url, init }) => [new URL(url).pathname, init?.method]), [
    ["/v1/public/experiences/apex%20racing/chat/messages", "POST"],
    ["/v1/public/experiences/apex%20racing/chat/conversations/conversation%2F1/messages", "GET"],
    ["/v1/public/experiences/apex%20racing/chat/conversations/conversation%2F1/confirm", "POST"],
  ]);
  requests.forEach(({ init }) => assert.equal(new Headers(init?.headers).has("Authorization"), false));
});

test("experience knowledge and channel SDK methods preserve owner paths", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const knowledge = { question: "Where should I park?", answer: "Use the north entrance." };
  const channels = { web_booking: true, web_chat: true, whatsapp: false };
  const client = createReservationPlatformClient({
    baseUrl: "https://platform.example",
    fetch: async (url, init) => {
      requests.push({ url: String(url), init });
      return jsonResponse({});
    },
  });

  await client.listExperienceKnowledge(true);
  await client.createExperienceKnowledge(knowledge);
  await client.updateExperienceKnowledge("knowledge/1", knowledge);
  await client.archiveExperienceKnowledge("knowledge/1");
  await client.getExperienceChannelSettings();
  await client.updateExperienceChannelSettings(channels);

  assert.deepEqual(requests.map(({ url, init }) => [`${new URL(url).pathname}${new URL(url).search}`, init?.method]), [
    ["/v1/experience/knowledge?include_archived=true", "GET"],
    ["/v1/experience/knowledge", "POST"],
    ["/v1/experience/knowledge/knowledge%2F1", "PUT"],
    ["/v1/experience/knowledge/knowledge%2F1/archive", "POST"],
    ["/v1/experience/channels", "GET"],
    ["/v1/experience/channels", "PUT"],
  ]);
  assert.deepEqual(JSON.parse(String(requests[1]!.init?.body)), knowledge);
  assert.deepEqual(JSON.parse(String(requests[5]!.init?.body)), channels);
});

test("SDK maps createReservation to POST /v1/reservations with context headers", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const client = createReservationPlatformClient({
    baseUrl: "https://api.example.test",
    tenantId: "tenant_123",
    venueId: "venue_123",
    getAccessToken: () => "token_123",
    fetch: async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return jsonResponse({
        reservation_id: "res_123",
        status: "confirmed",
        service_id: "svc_123",
        quantity: 1,
      });
    },
  });

  await client.createReservation(
    {
      service_id: "svc_123",
      quantity: 1,
      customer: { name: "Alex" },
    },
    { idempotencyKey: "idem_123", correlationId: "corr_123" },
  );

  assert.equal(calls[0].url, "https://api.example.test/v1/reservations");
  assert.equal(calls[0].init.method, "POST");
  const headers = new Headers(calls[0].init.headers);
  assert.equal(headers.get("Authorization"), "Bearer token_123");
  assert.equal(headers.get("X-Reservation-Tenant-Id"), "tenant_123");
  assert.equal(headers.get("X-Reservation-Venue-Id"), "venue_123");
  assert.equal(headers.get("X-Correlation-Id"), "corr_123");
  assert.equal(headers.get("Idempotency-Key"), "idem_123");
});

test("SDK builds base URL, API version, encoded paths, query strings, and returns raw JSON", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const rawPayload = {
    slots: [{
      start_at: "2026-06-08T12:00:00+08:00",
      end_at: "2026-06-08T13:00:00+08:00",
      available_quantity: 2,
      is_available: true,
      resource_ids: ["res/a", "res b"],
    }],
    total_quantity: 4,
  };
  const client = createReservationPlatformClient({
    baseUrl: "https://api.example.test/platform/",
    apiVersion: "v2",
    fetch: async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return jsonResponse(rawPayload);
    },
  });

  const response = await client.listAvailability({
    service_id: "svc 123",
    quantity: 2,
    resource_ids: ["res/a", "res b"],
  });

  const url = new URL(calls[0].url);
  assert.equal(url.origin, "https://api.example.test");
  assert.equal(url.pathname, "/platform/v2/availability");
  assert.equal(url.searchParams.get("service_id"), "svc 123");
  assert.equal(url.searchParams.get("quantity"), "2");
  assert.deepEqual(url.searchParams.getAll("resource_ids"), ["res/a", "res b"]);
  assert.equal(calls[0].init.method, "GET");
  assert.deepEqual(response, rawPayload);
});

test("SDK preserves platform error body", async () => {
  const client = createReservationPlatformClient({
    baseUrl: "https://api.example.test",
    fetch: async () => jsonResponse({
      error: {
        code: "missing_idempotency_key",
        message: "Missing idempotency key.",
        status: 400,
        request_id: "req_123",
      },
    }, 400),
  });

  await assert.rejects(
    () => client.createReservation({
      service_id: "svc_123",
      quantity: 1,
      customer: { name: "Alex" },
    }),
    (error) => {
      assert.equal(isPlatformError(error), true);
      assert.equal(error.body.code, "missing_idempotency_key");
      assert.equal(error.body.request_id, "req_123");
      return true;
    },
  );
});

test("SDK omits empty auth tokens and lets request context override constructor context", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const client = createReservationPlatformClient({
    baseUrl: "https://api.example.test",
    tenantId: "tenant_default",
    venueId: "venue_default",
    getAccessToken: async () => "",
    headers: () => ({ "X-App-Header": "app" }),
    fetch: async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return jsonResponse({ services: [] });
    },
  });

  await client.listServices(undefined, {
    tenantId: "tenant_request",
    venueId: "venue_request",
    correlationId: "corr_request",
    headers: { "X-Request-Header": "request" },
  });

  const headers = new Headers(calls[0].init.headers);
  assert.equal(headers.get("Authorization"), null);
  assert.equal(headers.get("X-Reservation-Tenant-Id"), "tenant_request");
  assert.equal(headers.get("X-Reservation-Venue-Id"), "venue_request");
  assert.equal(headers.get("X-Correlation-Id"), "corr_request");
  assert.equal(headers.get("X-App-Header"), "app");
  assert.equal(headers.get("X-Request-Header"), "request");
});

test("SDK exposes an explicit idempotency key helper without using it implicitly", async () => {
  const generatedKey = createIdempotencyKey("reservation-create");
  assert.match(generatedKey, /^reservation-create-/);
  assert.equal(generatedKey.length > "reservation-create-".length + 20, true);

  const calls: { init: RequestInit }[] = [];
  const client = createReservationPlatformClient({
    baseUrl: "https://api.example.test",
    fetch: async (_url, init) => {
      calls.push({ init: init ?? {} });
      return jsonResponse({
        error: {
          code: "missing_idempotency_key",
          message: "Missing idempotency key.",
          status: 400,
        },
      }, 400);
    },
  });

  await assert.rejects(() => client.createReservation({
    service_id: "svc_123",
    quantity: 1,
    customer: { name: "Alex" },
  }));

  const headers = new Headers(calls[0].init.headers);
  assert.equal(headers.get("Idempotency-Key"), null);
});

test("SDK maps chat JSON endpoints and forwards body plus idempotency", async () => {
  const calls: { url: string; body: unknown; headers: Headers }[] = [];
  const client = createReservationPlatformClient({
    baseUrl: "https://api.example.test",
    fetch: async (url, init) => {
      calls.push({
        url: String(url),
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
        headers: new Headers(init?.headers),
      });
      return jsonResponse({
        chat_session_id: "chat_123",
        status: "open",
        content: "ok",
      });
    },
  });

  await client.chat.createReservationSession(
    { service_id: "svc_123", customer: { name: "Alex" } },
    { idempotencyKey: "idem_chat_create" },
  );
  await client.chat.sendMessage(
    "chat_123",
    { message: "hello" },
    { idempotencyKey: "idem_chat_message" },
  );
  await client.chat.confirmReservation(
    "chat_123",
    { reservation_intent_id: "intent_123" },
    { idempotencyKey: "idem_chat_confirm" },
  );

  assert.equal(calls[0].url, "https://api.example.test/v1/chat/reservation-sessions");
  assert.deepEqual(calls[0].body, { service_id: "svc_123", customer: { name: "Alex" } });
  assert.equal(calls[0].headers.get("Idempotency-Key"), "idem_chat_create");
  assert.equal(calls[1].url, "https://api.example.test/v1/chat/reservation-sessions/chat_123/messages");
  assert.deepEqual(calls[1].body, { message: "hello" });
  assert.equal(calls[1].headers.get("Idempotency-Key"), "idem_chat_message");
  assert.equal(calls[2].url, "https://api.example.test/v1/chat/reservation-sessions/chat_123/confirm");
  assert.deepEqual(calls[2].body, { reservation_intent_id: "intent_123" });
  assert.equal(calls[2].headers.get("Idempotency-Key"), "idem_chat_confirm");
});

test("SDK maps streamMessage to messages:stream endpoint", async () => {
  const calls: string[] = [];
  const stream = new ReadableStream<Uint8Array>();
  const client = createReservationPlatformClient({
    baseUrl: "https://api.example.test/",
    fetch: async (url) => {
      calls.push(String(url));
      return new Response(stream);
    },
  });

  const response = await client.chat.streamMessage("chat_123", { message: "hello" });

  assert.equal(calls[0], "https://api.example.test/v1/chat/reservation-sessions/chat_123/messages:stream");
  assert.equal(response, stream);
});

test("SDK maps getResourceLayout to the resource-layouts endpoint", async () => {
  const calls: string[] = [];
  const client = createReservationPlatformClient({
    baseUrl: "https://api.example.test",
    fetch: async (url) => {
      calls.push(String(url));
      return jsonResponse({
        layout_id: "layout_123",
        kind: "grid",
        resources: [{ resource_id: "res_123", row: 1, column: 1 }],
      });
    },
  });

  const layout = await client.getResourceLayout("layout_123");

  assert.equal(calls[0], "https://api.example.test/v1/resource-layouts/layout_123");
  assert.equal(layout.kind, "grid");
  assert.equal(layout.resources?.[0]?.resource_id, "res_123");
});

test("SDK retries safe reads when configured", async () => {
  let attempts = 0;
  const client = createReservationPlatformClient({
    baseUrl: "https://api.example.test",
    retry: { attempts: 2 },
    fetch: async () => {
      attempts += 1;
      if (attempts === 1) {
        return jsonResponse({
          error: {
            code: "temporarily_unavailable",
            message: "Try again.",
            status: 503,
            retryable: true,
          },
        }, 503);
      }
      return jsonResponse({ venues: [] });
    },
  });

  await client.listVenues();

  assert.equal(attempts, 2);
});

test("SDK does not retry mutations by default", async () => {
  let attempts = 0;
  const client = createReservationPlatformClient({
    baseUrl: "https://api.example.test",
    retry: { attempts: 2 },
    fetch: async () => {
      attempts += 1;
      return jsonResponse({
        error: {
          code: "temporarily_unavailable",
          message: "Try again.",
          status: 503,
          retryable: true,
        },
      }, 503);
    },
  });

  await assert.rejects(() => client.createReservation({
    service_id: "svc_123",
    quantity: 1,
    customer: { name: "Alex" },
  }));

  assert.equal(attempts, 1);
});

test("SDK retries mutations with an idempotency key when configured", async () => {
  let attempts = 0;
  const client = createReservationPlatformClient({
    baseUrl: "https://api.example.test",
    retry: { attempts: 2 },
    fetch: async () => {
      attempts += 1;
      if (attempts === 1) {
        return jsonResponse({
          error: {
            code: "temporarily_unavailable",
            message: "Try again.",
            status: 503,
            retryable: true,
          },
        }, 503);
      }
      return jsonResponse({
        reservation_id: "reservation_123",
        service_id: "svc_123",
        status: "confirmed",
        quantity: 1,
      });
    },
  });

  const reservation = await client.createReservation({
    service_id: "svc_123",
    quantity: 1,
    customer: { name: "Alex" },
  }, { idempotencyKey: "booking_123" });

  assert.equal(attempts, 2);
  assert.equal(reservation.reservation_id, "reservation_123");
});

test("SDK does not retry aborted safe reads", async () => {
  let attempts = 0;
  const controller = new AbortController();
  controller.abort();
  const client = createReservationPlatformClient({
    baseUrl: "https://api.example.test",
    retry: { attempts: 2 },
    fetch: async (_url, init) => {
      attempts += 1;
      if (init?.signal instanceof AbortSignal && init.signal.aborted) {
        throw new DOMException("Request aborted.", "AbortError");
      }
      return jsonResponse({ venues: [] });
    },
  });

  await assert.rejects(() => client.listVenues(undefined, { signal: controller.signal }));

  assert.equal(attempts, 1);
});

test("SDK timeout aborts a request without retrying it", async () => {
  let attempts = 0;
  const client = createReservationPlatformClient({
    baseUrl: "https://api.example.test",
    retry: { attempts: 2 },
    timeoutMs: 1,
    fetch: async (_url, init) => {
      attempts += 1;
      await new Promise((resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      });
      return jsonResponse({ venues: [] });
    },
  });

  await assert.rejects(() => client.listVenues());

  assert.equal(attempts, 1);
});

test("SDK source stays browser-safe and package-boundary clean", async () => {
  const sourceFiles = await listSourceFiles(new URL(".", import.meta.url));
  const forbiddenPatterns = [
    /process\.env/,
    /@supabase\//,
    /from\s+["']next\//,
    /from\s+["']react["']/,
    /from\s+["']@\/[^"']+/,
    /from\s+["'](?:\.\.\/){2,}app\//,
    /from\s+["'](?:\.\.\/){2,}lib\//,
    /from\s+["'](?:\.\.\/){2,}components\//,
    /GOOGLE_GENERATIVE_AI_API_KEY/,
    /OPENROUTER_API_KEY/,
    /SUPABASE_SERVICE/,
  ];

  for (const fileUrl of sourceFiles) {
    const source = await readFile(fileUrl, "utf8");
    for (const pattern of forbiddenPatterns) {
      assert.equal(pattern.test(source), false, `${fileUrl.pathname} matched forbidden pattern ${pattern}`);
    }
  }
});

test("SDK package manifest keeps runtime dependencies minimal", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  ) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  assert.deepEqual(Object.keys(packageJson.dependencies ?? {}).sort(), [
    "@reservation-platform/contract-types",
  ]);
  assert.equal(packageJson.devDependencies?.typescript !== undefined, true);
  assert.equal(packageJson.devDependencies?.tsx !== undefined, true);
});

async function listSourceFiles(directoryUrl: URL): Promise<URL[]> {
  const entries = await readdir(directoryUrl, { withFileTypes: true });
  const files: URL[] = [];

  for (const entry of entries) {
    const entryUrl = new URL(entry.name, directoryUrl);
    if (entry.isDirectory()) {
      files.push(...await listSourceFiles(new URL(`${entry.name}/`, directoryUrl)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      files.push(entryUrl);
    }
  }

  return files;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
