import assert from "node:assert/strict";
import { once } from "node:events";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { request as httpRequest, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import test from "node:test";

import {
  availabilityResponseSchema,
  listReservationsResponseSchema,
  listResourceMaintenanceResponseSchema,
  metadataResponseSchema,
  platformErrorResponseSchema,
  reservationResponseSchema,
  resourceMaintenanceResponseSchema,
  type AvailabilityResponse,
  type BusinessProfileResponse,
  type ExperienceConfigurationResponse,
  type ExperienceWorkspaceResponse,
  type PlatformErrorResponse,
  type PublicExperienceResponse,
} from "@reservation-platform/contract-types";
import { createAssignedResourcePolicy, type ReservationService } from "@project-play/reservations-core";
import type {
  AuthenticatedPlatformPrincipal,
  AvailabilityRepositoryPort,
  IdempotencyCommitRecord,
  IdempotencyRecord,
  IdempotencyRepository,
  ExperienceStudioRepository,
  PlatformCatalogRepository,
  PlatformTenantVenueRepository,
  ReservationCreateRepositoryPort,
  ReservationMutationRepositoryPort,
  ReservationReadRepositoryPort,
  ResourceMaintenanceRepositoryPort,
} from "@reservation-platform/api";

import {
  createStandaloneApiHandler,
  handleStandaloneApiRequest,
  type StandaloneApiChatModule,
  type StandaloneApiHandler,
  type StandaloneApiWhatsAppModule,
} from "./routes.js";
import { createStandaloneNodeServer } from "./server.js";

const disabledChatBody = {
  error: {
    code: "chat_module_disabled",
    message: "Chat module is disabled.",
    status: 404,
  },
};
const disabledWhatsAppBody = {
  error: {
    code: "whatsapp_module_disabled",
    message: "WhatsApp module is disabled.",
    status: 404,
  },
};
const standaloneHealthBody = {
  status: "ok",
  service: "standalone-api-skeleton",
  api_version: "v1",
  readiness: "alive",
};

function experienceWorkspaceFixture(): ExperienceWorkspaceResponse {
  const profile: BusinessProfileResponse = {
    business_id: "business_1",
    tenant_id: "tenant_1",
    venue_id: "venue_1",
    name: "Apex Racing",
    public_slug: "apex-racing",
    preset_id: "racing_gaming",
    status: "published",
  };
  const published: ExperienceConfigurationResponse = {
    configuration_id: "configuration_1",
    business_id: "business_1",
    version: 1,
    state: "published",
    preset_id: "racing_gaming",
    branding: { brand_name: "Apex Racing" },
    terminology: { customer: "Driver", resource: "Simulator", booking: "Session" },
    channels: { web_booking: true, web_chat: false, whatsapp: false },
    updated_at: "2026-07-13T00:00:00.000Z",
    published_at: "2026-07-13T00:00:00.000Z",
  };
  return {
    profile,
    draft: { ...published, configuration_id: "draft_1", version: 2, state: "draft", published_at: undefined },
    published,
  };
}

function fakeExperienceRepository(
  overrides: Partial<ExperienceStudioRepository> = {},
): ExperienceStudioRepository {
  return {
    readWorkspace: async () => experienceWorkspaceFixture(),
    saveDraft: async () => experienceWorkspaceFixture(),
    publishDraft: async () => experienceWorkspaceFixture(),
    readPublishedBySlug: async () => ({
      profile: experienceWorkspaceFixture().profile,
      configuration: experienceWorkspaceFixture().published!,
    }),
    ...overrides,
  };
}

test("owner experience routes require auth and tenant venue context", async () => {
  const unauthorized = await handleStandaloneApiRequest({
    method: "GET",
    path: "/v1/experience/workspace",
    headers: {},
  }, {
    serviceApiKey: "secret",
    experienceStudioRepository: fakeExperienceRepository(),
  });
  assert.equal(unauthorized.status, 401);

  const missingVenue = await handleStandaloneApiRequest({
    method: "GET",
    path: "/v1/experience/workspace",
    headers: {
      authorization: "Bearer secret",
      "x-reservation-tenant-id": "tenant_1",
    },
  }, {
    serviceApiKey: "secret",
    experienceStudioRepository: fakeExperienceRepository(),
  });
  assert.equal(missingVenue.status, 400);
});

test("public experience route does not require owner auth", async () => {
  const response = await handleStandaloneApiRequest({
    method: "GET",
    path: "/v1/public/experiences/apex-racing",
    headers: {},
  }, {
    serviceApiKey: "secret",
    experienceStudioRepository: fakeExperienceRepository(),
  });

  assert.equal(response.status, 200);
  assert.equal((response.body as PublicExperienceResponse).profile.public_slug, "apex-racing");
});

test("experience draft route validates strict request bodies", async () => {
  const response = await handleStandaloneApiRequest({
    method: "PUT",
    path: "/v1/experience/draft",
    headers: {
      authorization: "Bearer secret",
      "x-reservation-tenant-id": "tenant_1",
      "x-reservation-venue-id": "venue_1",
    },
    body: { preset_id: "unknown" },
  }, {
    serviceApiKey: "secret",
    experienceStudioRepository: fakeExperienceRepository(),
  });

  assert.equal(response.status, 400);
  assert.equal((response.body as PlatformErrorResponse).error.code, "validation_failed");
});

test("experience routes report invalid slugs and missing repositories", async () => {
  const invalidSlug = await handleStandaloneApiRequest({
    method: "GET",
    path: "/v1/public/experiences/Invalid%20Slug",
  }, { experienceStudioRepository: fakeExperienceRepository() });
  assert.equal(invalidSlug.status, 400);

  const missingRepository = await handleStandaloneApiRequest({
    method: "GET",
    path: "/v1/public/experiences/apex-racing",
  });
  assert.equal(missingRepository.status, 503);
});

function fakeWhatsAppModule(
  overrides: Partial<StandaloneApiWhatsAppModule> = {},
): StandaloneApiWhatsAppModule {
  return {
    startSession: () => ({
      provider: "session_qr",
      status: "pending_qr",
      session_id: "session_123",
      qr_code: "qr_payload",
      updated_at: "2026-06-30T00:00:00.000Z",
    }),
    sessionStatus: () => ({
      provider: "session_qr",
      status: "pending_qr",
      session_id: "session_123",
      updated_at: "2026-06-30T00:00:00.000Z",
    }),
    sessionQr: () => ({
      provider: "session_qr",
      status: "pending_qr",
      session_id: "session_123",
      qr_code: "qr_payload",
      updated_at: "2026-06-30T00:00:00.000Z",
    }),
    logoutSession: () => ({
      provider: "session_qr",
      status: "disconnected",
      updated_at: "2026-06-30T00:00:00.000Z",
    }),
    getConfig: () => ({
      business_name: "Reservation Business",
      language: "en",
      tone: "friendly_professional",
      fallback_message: "Please wait while staff checks this for you.",
      booking_confirmation_required: true,
      updated_at: "2026-06-30T00:00:00.000Z",
    }),
    updateConfig: (input) => ({
      business_name: input.business_name ?? "Reservation Business",
      language: input.language ?? "en",
      tone: input.tone ?? "friendly_professional",
      fallback_message: input.fallback_message ?? "Please wait while staff checks this for you.",
      booking_confirmation_required: input.booking_confirmation_required ?? true,
      updated_at: "2026-06-30T00:00:00.000Z",
    }),
    listKnowledge: () => [],
    createKnowledge: (input) => ({
      knowledge_id: "knowledge_123",
      title: input.title,
      content: input.content,
      tags: input.tags ?? [],
      active: input.active ?? true,
      metadata: input.metadata,
      created_at: "2026-06-30T00:00:00.000Z",
      updated_at: "2026-06-30T00:00:00.000Z",
    }),
    updateKnowledge: (knowledgeId, input) => ({
      knowledge_id: knowledgeId,
      title: input.title ?? "Opening hours",
      content: input.content ?? "We are open.",
      tags: input.tags ?? [],
      active: input.active ?? true,
      metadata: input.metadata,
      created_at: "2026-06-30T00:00:00.000Z",
      updated_at: "2026-06-30T00:00:00.000Z",
    }),
    deleteKnowledge: () => true,
    listConversations: () => [],
    listConversationMessages: () => [],
    handleInboundMessage: () => ({ content: "simulated reply" }),
    readiness: () => ({
      database_ready: true,
      provider_ready: true,
      reservation_tools_ready: true,
      simulation_enabled: true,
    }),
    ...overrides,
  };
}

test("disabled WhatsApp session routes return the shared platform error body", async () => {
  const routes = [
    { method: "POST", path: "/v1/channels/whatsapp/session/start" },
    { method: "GET", path: "/v1/channels/whatsapp/session/status" },
    { method: "GET", path: "/v1/channels/whatsapp/session/qr" },
    { method: "POST", path: "/v1/channels/whatsapp/session/logout" },
  ];

  for (const route of routes) {
    const response = await handleStandaloneApiRequest(route);

    assert.equal(response.status, 404, route.path);
    assert.deepEqual(response.body, disabledWhatsAppBody, route.path);
  }
});

test("enabled WhatsApp session module receives owner lifecycle calls", async () => {
  const calls: string[] = [];
  const whatsappModule: StandaloneApiWhatsAppModule = fakeWhatsAppModule({
    startSession(input) {
      calls.push(`start:${input.tenant_id}:${input.venue_id}`);
      return {
        provider: "session_qr",
        status: "pending_qr",
        session_id: "session_123",
        qr_code: "qr_payload",
        updated_at: "2026-06-30T00:00:00.000Z",
      };
    },
    sessionStatus() {
      calls.push("status");
      return {
        provider: "session_qr",
        status: "pending_qr",
        session_id: "session_123",
        updated_at: "2026-06-30T00:00:00.000Z",
      };
    },
    sessionQr() {
      calls.push("qr");
      return {
        provider: "session_qr",
        status: "pending_qr",
        session_id: "session_123",
        qr_code: "qr_payload",
        updated_at: "2026-06-30T00:00:00.000Z",
      };
    },
    logoutSession() {
      calls.push("logout");
      return {
        provider: "session_qr",
        status: "disconnected",
        updated_at: "2026-06-30T00:00:00.000Z",
      };
    },
  });
  const handler = createStandaloneApiHandler({ whatsappModule });

  const start = await handler({
    method: "POST",
    path: "/v1/channels/whatsapp/session/start",
    headers: {
      "X-Reservation-Tenant-Id": "tenant_1",
      "X-Reservation-Venue-Id": "venue_1",
    },
    body: {},
  });
  const status = await handler({ method: "GET", path: "/v1/channels/whatsapp/session/status" });
  const qr = await handler({ method: "GET", path: "/v1/channels/whatsapp/session/qr" });
  const logout = await handler({ method: "POST", path: "/v1/channels/whatsapp/session/logout" });

  assert.equal(start.status, 200);
  assert.equal((start.body as { qr_code?: string }).qr_code, "qr_payload");
  assert.equal(status.status, 200);
  assert.equal(qr.status, 200);
  assert.equal(logout.status, 200);
  assert.deepEqual(calls, ["start:tenant_1:venue_1", "status", "qr", "logout"]);
});

test("service-token auth protects WhatsApp owner session routes", async () => {
  const handler = createStandaloneApiHandler({
    auth: { serviceApiKey: "platform-service-secret" },
    whatsappModule: fakeWhatsAppModule({
      startSession() {
        throw new Error("unauthorized request should not invoke WhatsApp module");
      },
      sessionStatus() {
        throw new Error("unauthorized request should not invoke WhatsApp module");
      },
      sessionQr() {
        throw new Error("unauthorized request should not invoke WhatsApp module");
      },
      logoutSession() {
        throw new Error("unauthorized request should not invoke WhatsApp module");
      },
    }),
  });

  for (const route of [
    { method: "POST", path: "/v1/channels/whatsapp/session/start" },
    { method: "GET", path: "/v1/channels/whatsapp/session/status" },
    { method: "GET", path: "/v1/channels/whatsapp/session/qr" },
    { method: "POST", path: "/v1/channels/whatsapp/session/logout" },
  ]) {
    const response = await handler(route);

    assert.equal(response.status, 401, route.path);
    assert.equal((response.body as PlatformErrorResponse).error.message, "Missing bearer token.");
  }
});

test("enabled WhatsApp config and knowledge routes delegate to the module", async () => {
  const calls: string[] = [];
  const handler = createStandaloneApiHandler({
    whatsappModule: fakeWhatsAppModule({
      updateConfig(input) {
        calls.push(`config:${input.business_name}`);
        return {
          business_name: input.business_name ?? "Reservation Business",
          language: "en",
          tone: "friendly_professional",
          fallback_message: "Please wait while staff checks this for you.",
          booking_confirmation_required: true,
          updated_at: "2026-06-30T00:00:00.000Z",
        };
      },
      listKnowledge() {
        calls.push("knowledge:list");
        return [];
      },
      createKnowledge(input) {
        calls.push(`knowledge:create:${input.title}`);
        return {
          knowledge_id: "knowledge_123",
          title: input.title,
          content: input.content,
          tags: input.tags ?? [],
          active: input.active ?? true,
          created_at: "2026-06-30T00:00:00.000Z",
          updated_at: "2026-06-30T00:00:00.000Z",
        };
      },
    }),
  });

  const config = await handler({
    method: "PATCH",
    path: "/v1/channels/whatsapp/config",
    body: { business_name: "CH Room Booking" },
  });
  const knowledgeList = await handler({
    method: "GET",
    path: "/v1/channels/whatsapp/knowledge",
  });
  const knowledgeCreate = await handler({
    method: "POST",
    path: "/v1/channels/whatsapp/knowledge",
    body: {
      title: "Opening hours",
      content: "We are open Monday to Friday.",
      tags: ["hours"],
    },
  });

  assert.equal(config.status, 200);
  assert.equal((config.body as { business_name?: string }).business_name, "CH Room Booking");
  assert.deepEqual(knowledgeList.body, { knowledge: [] });
  assert.equal((knowledgeCreate.body as { title?: string }).title, "Opening hours");
  assert.deepEqual(calls, [
    "config:CH Room Booking",
    "knowledge:list",
    "knowledge:create:Opening hours",
  ]);
});

test("WhatsApp knowledge create validates required title and content", async () => {
  const response = await createStandaloneApiHandler({
    whatsappModule: fakeWhatsAppModule(),
  })({
    method: "POST",
    path: "/v1/channels/whatsapp/knowledge",
    body: { title: "Opening hours" },
  });

  assert.equal(response.status, 400);
  assert.equal((response.body as PlatformErrorResponse).error.message, "Knowledge title and content are required.");
});

test("WhatsApp config update rejects malformed owner settings", async () => {
  let updateCalls = 0;
  const response = await createStandaloneApiHandler({
    whatsappModule: fakeWhatsAppModule({
      updateConfig() {
        updateCalls += 1;
        throw new Error("invalid config should not reach WhatsApp module");
      },
    }),
  })({
    method: "PATCH",
    path: "/v1/channels/whatsapp/config",
    body: {
      business_name: " ",
    },
  });

  assert.equal(response.status, 400);
  assert.equal((response.body as PlatformErrorResponse).error.message, "business_name must be a non-empty string.");
  assert.equal(updateCalls, 0);
});

test("enabled WhatsApp readiness and simulation routes delegate to the module", async () => {
  const calls: string[] = [];
  const handler = createStandaloneApiHandler({
    whatsappModule: fakeWhatsAppModule({
      readiness() {
        calls.push("readiness");
        return {
          database_ready: true,
          provider_ready: true,
          reservation_tools_ready: true,
          simulation_enabled: true,
        };
      },
      handleInboundMessage(input) {
        calls.push(`simulate:${input.text}:${input.from.phoneNumber}`);
        return { content: "simulated reply" };
      },
    }),
  });

  const readiness = await handler({ method: "GET", path: "/v1/channels/whatsapp/readiness" });
  const simulation = await handler({
    method: "POST",
    path: "/v1/channels/whatsapp/messages:simulate",
    body: {
      text: "Book a room tomorrow",
      phone: "+60111111111",
    },
  });

  assert.equal(readiness.status, 200);
  assert.equal((readiness.body as { simulation_enabled?: boolean }).simulation_enabled, true);
  assert.equal(simulation.status, 200);
  assert.deepEqual(simulation.body, { content: "simulated reply" });
  assert.deepEqual(calls, ["readiness", "simulate:Book a room tomorrow:+60111111111"]);
});

test("enabled WhatsApp conversation routes update automation and send staff replies", async () => {
  const calls: string[] = [];
  const handler = createStandaloneApiHandler({
    auth: { serviceApiKey: "platform-service-secret" },
    whatsappModule: fakeWhatsAppModule({
      updateConversationAutomationStatus(input) {
        calls.push(`status:${input.conversation_id}:${input.automation_status}:${input.changed_by}`);
        return {
          conversation_id: input.conversation_id,
          provider: "session_qr",
          customer: { id: "60111111111@s.whatsapp.net" },
          status: "active",
          automation_status: input.automation_status,
          created_at: "2026-06-30T00:00:00.000Z",
          updated_at: "2026-06-30T00:00:00.000Z",
        };
      },
      sendConversationMessage(input) {
        calls.push(`send:${input.conversation_id}:${input.text}:${input.changed_by}`);
        return {
          message_id: "message_123",
          conversation_id: input.conversation_id,
          direction: "outbound",
          content: input.text,
          created_at: "2026-06-30T00:00:00.000Z",
        };
      },
    }),
  });

  const takeover = await handler({
    method: "PATCH",
    path: "/v1/channels/whatsapp/conversations/conversation_123",
    headers: { Authorization: "Bearer platform-service-secret" },
    body: { automation_status: "manual" },
  });
  const send = await handler({
    method: "POST",
    path: "/v1/channels/whatsapp/conversations/conversation_123/messages",
    headers: { Authorization: "Bearer platform-service-secret" },
    body: { text: "Staff reply" },
  });

  assert.equal(takeover.status, 200);
  assert.equal((takeover.body as { automation_status?: string }).automation_status, "manual");
  assert.equal(send.status, 200);
  assert.equal((send.body as { content?: string }).content, "Staff reply");
  assert.deepEqual(calls, [
    "status:conversation_123:manual:authenticated-owner",
    "send:conversation_123:Staff reply:authenticated-owner",
  ]);
});

test("WhatsApp conversation routes validate automation status and staff reply text", async () => {
  const handler = createStandaloneApiHandler({
    whatsappModule: fakeWhatsAppModule({
      updateConversationAutomationStatus() {
        throw new Error("invalid automation status should not reach WhatsApp module");
      },
      sendConversationMessage() {
        throw new Error("invalid staff reply should not reach WhatsApp module");
      },
    }),
  });

  const invalidStatus = await handler({
    method: "PATCH",
    path: "/v1/channels/whatsapp/conversations/conversation_123",
    body: { automation_status: "paused" },
  });
  const invalidMessage = await handler({
    method: "POST",
    path: "/v1/channels/whatsapp/conversations/conversation_123/messages",
    body: { text: " " },
  });

  assert.equal(invalidStatus.status, 400);
  assert.equal((invalidStatus.body as PlatformErrorResponse).error.message, "automation_status must be automated or manual.");
  assert.equal(invalidMessage.status, 400);
  assert.equal((invalidMessage.body as PlatformErrorResponse).error.message, "text must be a non-empty string.");
});

test("disabled WhatsApp simulation returns a protected setup error", async () => {
  const handler = createStandaloneApiHandler({
    whatsappModule: fakeWhatsAppModule({
      handleInboundMessage() {
        const error = new Error("WhatsApp inbound simulation is disabled.");
        error.name = "WhatsAppSimulationDisabledError";
        throw error;
      },
    }),
  });

  const response = await handler({
    method: "POST",
    path: "/v1/channels/whatsapp/messages:simulate",
    body: { text: "hello" },
  });

  assert.equal(response.status, 403);
  assert.deepEqual(response.body, {
    error: {
      code: "forbidden",
      message: "WhatsApp inbound simulation is disabled.",
      status: 403,
    },
  });
});

test("GET /v1/metadata returns platform metadata from the backend package", async () => {
  const response = await handleStandaloneApiRequest({ method: "GET", path: "/v1/metadata" });

  assert.equal(response.status, 200);
  assert.equal(response.headers["content-type"], "application/json; charset=utf-8");
  assert.equal(metadataResponseSchema.safeParse(response.body).success, true);
  assert.deepEqual(response.body, {
    api_version: "v1",
    modules: ["reservations"],
    compatibility: {
      notices: [
        "Initial Next.js compatibility implementation for the backend platform /v1 contract.",
        "Resource maintenance list/create/end are available in compatibility mode; bulk replace is implemented by the frontend wrapper until the backend platform exposes a first-class bulk endpoint.",
      ],
    },
  });
});

test("GET health endpoints return public readiness metadata without dependencies", async () => {
  const routes = ["/healthz", "/v1/health"];

  for (const path of routes) {
    const response = await handleStandaloneApiRequest({ method: "GET", path });

    assert.equal(response.status, 200, path);
    assert.equal(response.headers["content-type"], "application/json; charset=utf-8", path);
    assert.deepEqual(response.body, standaloneHealthBody, path);
  }
});

test("service-token and JWT auth leave health endpoints unprotected", async () => {
  let verifierCalls = 0;
  let tenantVenueCalls = 0;
  const handler = createStandaloneApiHandler({
    auth: {
      serviceApiKey: "platform-service-secret",
      requireTenant: true,
      verifyBearerToken() {
        verifierCalls += 1;
        throw new Error("health should not invoke bearer-token verification");
      },
    },
    tenantVenueRepository: tenantVenueRepository({
      async getTenant() {
        tenantVenueCalls += 1;
        throw new Error("health should not validate tenant context");
      },
      async getVenue() {
        tenantVenueCalls += 1;
        throw new Error("health should not validate venue context");
      },
    }),
  });

  for (const path of ["/healthz", "/v1/health"]) {
    const response = await handler({ method: "GET", path });

    assert.equal(response.status, 200, path);
    assert.deepEqual(response.body, standaloneHealthBody, path);
  }
  assert.equal(verifierCalls, 0);
  assert.equal(tenantVenueCalls, 0);
});

test("disabled chat reservation routes return the shared platform error body", async () => {
  const routes = [
    "/v1/chat/reservation-sessions",
    "/v1/chat/reservation-sessions/session_123/messages",
    "/v1/chat/reservation-sessions/session_123/messages:stream",
    "/v1/chat/reservation-sessions/session_123/confirm",
  ];

  for (const path of routes) {
    const response = await handleStandaloneApiRequest({ method: "POST", path });
    assert.equal(response.status, 404, path);
    assert.deepEqual(response.body, disabledChatBody, path);
    assert.equal(platformErrorResponseSchema.safeParse(response.body).success, true, path);
  }
});

test("service-token auth protects disabled chat reservation routes before fallback", async () => {
  const routes = [
    "/v1/chat/reservation-sessions",
    "/v1/chat/reservation-sessions/session_123/messages",
    "/v1/chat/reservation-sessions/session_123/messages:stream",
    "/v1/chat/reservation-sessions/session_123/confirm",
  ];
  const handler = createStandaloneApiHandler({
    auth: { serviceApiKey: "platform-service-secret" },
  });

  for (const path of routes) {
    const missingBearer = await handler({ method: "POST", path });
    const wrongBearer = await handler({
      method: "POST",
      path,
      headers: { Authorization: "Bearer wrong-secret" },
    });
    const correctBearer = await handler({
      method: "POST",
      path,
      headers: { Authorization: "Bearer platform-service-secret" },
    });

    assert.equal(missingBearer.status, 401, path);
    assert.deepEqual(missingBearer.body, {
      error: {
        code: "unauthorized",
        message: "Missing bearer token.",
        status: 401,
      },
    }, path);
    assert.equal(wrongBearer.status, 403, path);
    assert.deepEqual(wrongBearer.body, {
      error: {
        code: "forbidden",
        message: "Invalid service bearer token.",
        status: 403,
      },
    }, path);
    assert.equal(correctBearer.status, 404, path);
    assert.deepEqual(correctBearer.body, disabledChatBody, path);
  }
});

test("bearer verifier auth protects disabled chat before fallback and tenant checks still apply", async () => {
  const verifierTokens: string[] = [];
  const handler = createStandaloneApiHandler({
    auth: {
      verifyBearerToken(input) {
        verifierTokens.push(input.token);
        if (input.token !== "valid-user-token") {
          return rejectedAuthResult();
        }

        return {
          ok: true,
          principal: userPrincipal({ tenantIds: ["tenant_1"] }),
        };
      },
      requireTenant: true,
    },
  });

  const missingBearer = await handler({
    method: "POST",
    path: "/v1/chat/reservation-sessions",
  });
  const rejectedBearer = await handler({
    method: "POST",
    path: "/v1/chat/reservation-sessions",
    headers: { Authorization: "Bearer rejected-user-token" },
  });
  const missingTenant = await handler({
    method: "POST",
    path: "/v1/chat/reservation-sessions",
    headers: { Authorization: "Bearer valid-user-token" },
  });
  const valid = await handler({
    method: "POST",
    path: "/v1/chat/reservation-sessions",
    headers: {
      Authorization: "Bearer valid-user-token",
      "X-Reservation-Tenant-Id": "tenant_1",
    },
  });

  assert.equal(missingBearer.status, 401);
  assert.deepEqual(missingBearer.body, {
    error: {
      code: "unauthorized",
      message: "Missing bearer token.",
      status: 401,
    },
  });
  assert.equal(rejectedBearer.status, 401);
  assert.deepEqual(rejectedBearer.body, rejectedAuthBody());
  assert.equal(missingTenant.status, 400);
  assert.deepEqual(missingTenant.body, {
    error: {
      code: "validation_failed",
      message: "Missing tenant context.",
      status: 400,
      details: {
        reason: "tenant_required",
      },
    },
  });
  assert.equal(valid.status, 404);
  assert.deepEqual(valid.body, disabledChatBody);
  assert.deepEqual(verifierTokens, ["rejected-user-token", "valid-user-token", "valid-user-token"]);
});

test("enabled chat module is invoked only after standalone auth succeeds", async () => {
  const verifierTokens: string[] = [];
  let calls = 0;
  const chatModule: StandaloneApiChatModule = {
    createReservationSession() {
      calls += 1;
      return {
        status: 201,
        body: {
          chat_session_id: "session_123",
          status: "active",
        },
      };
    },
    sendMessage() {
      calls += 1;
      return { body: {} };
    },
    streamMessage() {
      calls += 1;
      return { body: "" };
    },
    confirmReservation() {
      calls += 1;
      return { body: {} };
    },
  };
  const handler = createStandaloneApiHandler({
    auth: {
      verifyBearerToken(input) {
        verifierTokens.push(input.token);
        if (input.token !== "valid-user-token") {
          return rejectedAuthResult();
        }

        return {
          ok: true,
          principal: userPrincipal({ tenantIds: ["tenant_1"] }),
        };
      },
      requireTenant: true,
    },
    chatModule,
  });

  const rejected = await handler({
    method: "POST",
    path: "/v1/chat/reservation-sessions",
    headers: {
      Authorization: "Bearer rejected-user-token",
      "X-Reservation-Tenant-Id": "tenant_1",
    },
    body: { service_id: "svc_123" },
  });
  assert.equal(rejected.status, 401);
  assert.deepEqual(rejected.body, rejectedAuthBody());
  assert.equal(calls, 0);

  const valid = await handler({
    method: "POST",
    path: "/v1/chat/reservation-sessions",
    headers: {
      Authorization: "Bearer valid-user-token",
      "X-Reservation-Tenant-Id": "tenant_1",
    },
    body: { service_id: "svc_123" },
  });

  assert.equal(valid.status, 201);
  assert.deepEqual(valid.body, {
    chat_session_id: "session_123",
    status: "active",
  });
  assert.equal(calls, 1);
  assert.deepEqual(verifierTokens, ["rejected-user-token", "valid-user-token"]);
});

test("injected chat module receives request context and returns enabled responses", async () => {
  const calls: Array<{
    operation: string;
    body: unknown;
    chatSessionId?: string;
    context: Parameters<StandaloneApiChatModule["createReservationSession"]>[0]["context"];
  }> = [];
  const chatModule: StandaloneApiChatModule = {
    createReservationSession(input) {
      calls.push({ operation: "create", body: input.body, context: input.context });
      return {
        status: 201,
        body: {
          chat_session_id: "session_123",
          status: "active",
          metadata: { source: "fake-chat-module" },
        },
      };
    },
    sendMessage(input) {
      calls.push({
        operation: "send",
        body: input.body,
        chatSessionId: input.chatSessionId,
        context: input.context,
      });
      return {
        body: {
          chat_session_id: input.chatSessionId,
          message_id: "msg_123",
          content: `Echo: ${input.body.message}`,
        },
      };
    },
    streamMessage(input) {
      calls.push({
        operation: "stream",
        body: input.body,
        chatSessionId: input.chatSessionId,
        context: input.context,
      });
      return {
        headers: { "content-type": "application/x-ndjson; charset=utf-8" },
        body: [
          JSON.stringify({ type: "message.delta", delta: "Streaming" }),
          JSON.stringify({ type: "message.completed", finish_reason: "stop" }),
        ].join("\n"),
      };
    },
    confirmReservation(input) {
      calls.push({
        operation: "confirm",
        body: input.body,
        chatSessionId: input.chatSessionId,
        context: input.context,
      });
      return {
        body: {
          chat_session_id: input.chatSessionId,
          reservation: reservationBody({ reservation_id: "reservation_from_chat" }),
        },
      };
    },
  };
  const handler = createStandaloneApiHandler({ chatModule });
  const headers = {
    Authorization: "Bearer user-token",
    "X-Reservation-Tenant-Id": "tenant_1",
    "X-Reservation-Venue-Id": "venue_1",
    "X-Correlation-Id": "corr_123",
    "Idempotency-Key": "idem_chat_123",
  };

  const create = await handler({
    method: "POST",
    path: "/v1/chat/reservation-sessions",
    headers,
    body: { service_id: "svc_123", venue_id: "venue_1" },
  });
  const send = await handler({
    method: "POST",
    path: "/v1/chat/reservation-sessions/session_123/messages",
    headers,
    body: { message: "Hello" },
  });
  const stream = await handler({
    method: "POST",
    path: "/v1/chat/reservation-sessions/session_123/messages:stream",
    headers,
    body: { message: "Stream please" },
  });
  const confirm = await handler({
    method: "POST",
    path: "/v1/chat/reservation-sessions/session_123/confirm",
    headers,
    body: { reservation_intent_id: "intent_123" },
  });

  assert.equal(create.status, 201);
  assert.deepEqual(create.body, {
    chat_session_id: "session_123",
    status: "active",
    metadata: { source: "fake-chat-module" },
  });
  assert.equal(send.status, 200);
  assert.deepEqual(send.body, {
    chat_session_id: "session_123",
    message_id: "msg_123",
    content: "Echo: Hello",
  });
  assert.equal(stream.status, 200);
  assert.equal(stream.headers["content-type"], "application/x-ndjson; charset=utf-8");
  assert.equal(stream.body, [
    JSON.stringify({ type: "message.delta", delta: "Streaming" }),
    JSON.stringify({ type: "message.completed", finish_reason: "stop" }),
  ].join("\n"));
  assert.equal(confirm.status, 200);
  assert.deepEqual(confirm.body, {
    chat_session_id: "session_123",
    reservation: reservationBody({ reservation_id: "reservation_from_chat" }),
  });
  assert.deepEqual(calls.map((call) => call.operation), ["create", "send", "stream", "confirm"]);
  assert.deepEqual(calls.slice(1).map((call) => call.chatSessionId), ["session_123", "session_123", "session_123"]);
  for (const call of calls) {
    assert.equal(call.context.tenantId, "tenant_1", call.operation);
    assert.equal(call.context.venueId, "venue_1", call.operation);
    assert.equal(call.context.correlationId, "corr_123", call.operation);
    assert.equal(call.context.idempotencyKey, "idem_chat_123", call.operation);
    assert.equal(call.context.authorizationHeader, "Bearer user-token", call.operation);
    assert.equal(call.context.bearerToken, "user-token", call.operation);
    assert.deepEqual(call.context.requestContext, {
      authorizationHeader: "Bearer user-token",
      bearerToken: "user-token",
      tenantId: "tenant_1",
      venueId: "venue_1",
      correlationId: "corr_123",
      idempotencyKey: "idem_chat_123",
    }, call.operation);
  }
});

test("standalone Node server writes chat stream NDJSON string bodies raw", async () => {
  const ndjson = [
    JSON.stringify({ type: "message.delta", delta: "Streaming" }),
    JSON.stringify({ type: "message.completed", finish_reason: "stop" }),
  ].join("\n");
  const chatModule: StandaloneApiChatModule = {
    createReservationSession() {
      return { body: { chat_session_id: "session_123", status: "active" } };
    },
    sendMessage() {
      return { body: { chat_session_id: "session_123", message_id: "msg_123", content: "Hello" } };
    },
    streamMessage() {
      return {
        headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
        body: ndjson,
      };
    },
    confirmReservation() {
      return { body: { chat_session_id: "session_123", reservation: reservationBody() } };
    },
  };
  const handler = createStandaloneApiHandler({ chatModule });

  await withStandaloneNodeServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/chat/reservation-sessions/session_123/messages:stream`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Stream please" }),
    });
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/x-ndjson; charset=utf-8");
    assert.equal(body, ndjson);
    assert.notEqual(body, JSON.stringify(ndjson));
  }, handler);
});

test("standalone Node server writes raw string bodies with canonical Content-Type header", async () => {
  const ndjson = [
    JSON.stringify({ type: "message.delta", delta: "Streaming" }),
    JSON.stringify({ type: "message.completed", finish_reason: "stop" }),
  ].join("\n");
  const handler: StandaloneApiHandler = async () => ({
    status: 200,
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
    body: ndjson,
  });

  await withStandaloneNodeServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/test-stream`);
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/x-ndjson; charset=utf-8");
    assert.equal(body, ndjson);
    assert.notEqual(body, JSON.stringify(ndjson));
  }, handler);
});

test("standalone Node server answers health without parsing malformed GET bodies", async () => {
  let repositoryCalls = 0;
  const handler = createStandaloneApiHandler({
    auth: {
      serviceApiKey: "platform-service-secret",
      verifyBearerToken() {
        throw new Error("health should not invoke auth verification");
      },
    },
    availabilityRepository: availabilityRepository({
      async readAvailability() {
        repositoryCalls += 1;
        throw new Error("health should not read availability");
      },
    }),
  });

  await withStandaloneNodeServer(async (baseUrl) => {
    const response = await rawHttpRequest(`${baseUrl}/healthz`, {
      method: "GET",
      headers: {
        "content-type": "application/json",
        "content-length": "1",
      },
      body: "{",
    });
    const body = JSON.parse(response.body) as unknown;

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["content-type"], "application/json; charset=utf-8");
    assert.deepEqual(body, standaloneHealthBody);
    assert.equal(repositoryCalls, 0);
  }, handler);
});

test("enabled chat routes validate public request body shape before invoking chat module", async () => {
  let calls = 0;
  const chatModule: StandaloneApiChatModule = {
    createReservationSession() {
      calls += 1;
      return { body: {} };
    },
    sendMessage() {
      calls += 1;
      return { body: {} };
    },
    streamMessage() {
      calls += 1;
      return { body: "" };
    },
    confirmReservation() {
      calls += 1;
      return { body: {} };
    },
  };
  const handler = createStandaloneApiHandler({ chatModule });

  const cases = [
    {
      name: "create rejects array bodies",
      request: {
        method: "POST",
        path: "/v1/chat/reservation-sessions",
        body: [],
      },
      message: "Invalid chat request body.",
    },
    {
      name: "create rejects nested metadata",
      request: {
        method: "POST",
        path: "/v1/chat/reservation-sessions",
        body: { metadata: { nested: { value: "nope" } } },
      },
      message: "Invalid chat request body.",
    },
    {
      name: "message rejects invalid message type",
      request: {
        method: "POST",
        path: "/v1/chat/reservation-sessions/session_123/messages",
        body: { message: 123 },
      },
      message: "Invalid chat message data.",
    },
    {
      name: "confirm rejects invalid reservation intent type",
      request: {
        method: "POST",
        path: "/v1/chat/reservation-sessions/session_123/confirm",
        body: { reservation_intent_id: 123 },
      },
      message: "Invalid chat request body.",
    },
  ] as const;

  for (const testCase of cases) {
    const response = await handler(testCase.request);

    assert.equal(calls, 0, testCase.name);
    assert.equal(response.status, 400, testCase.name);
    assert.deepEqual(response.body, {
      error: {
        code: "validation_failed",
        message: testCase.message,
        status: 400,
      },
    }, testCase.name);
  }
});

test("enabled chat service errors are sanitized", async () => {
  const chatModule: StandaloneApiChatModule = {
    createReservationSession() {
      return { body: { chat_session_id: "session_123", status: "active" } };
    },
    sendMessage() {
      throw new Error("provider api key sk-provider-secret failed in model adapter");
    },
    streamMessage() {
      return { body: "" };
    },
    confirmReservation() {
      return { body: {} };
    },
  };
  const handler = createStandaloneApiHandler({ chatModule });

  const response = await handler({
    method: "POST",
    path: "/v1/chat/reservation-sessions/session_123/messages",
    body: { message: "Hello" },
  });

  assert.equal(response.status, 500);
  assert.deepEqual(response.body, {
    error: {
      code: "internal_error",
      message: "Chat module request failed.",
      status: 500,
    },
  });
  assert.equal(JSON.stringify(response.body).includes("provider"), false);
  assert.equal(JSON.stringify(response.body).includes("secret"), false);
});

test("enabled chat module returned 500 errors are sanitized", async () => {
  const chatModule: StandaloneApiChatModule = {
    createReservationSession() {
      return { body: { chat_session_id: "session_123", status: "active" } };
    },
    sendMessage() {
      return {
        status: 500,
        headers: { "x-provider-secret": "sk-provider-secret" },
        body: {
          error: {
            code: "provider_failed",
            message: "provider api key sk-provider-secret failed",
            status: 500,
            details: { provider: "internal-llm", secret: "sk-provider-secret" },
          },
        },
      };
    },
    streamMessage() {
      return { body: "" };
    },
    confirmReservation() {
      return { body: {} };
    },
  };
  const handler = createStandaloneApiHandler({ chatModule });

  const response = await handler({
    method: "POST",
    path: "/v1/chat/reservation-sessions/session_123/messages",
    body: { message: "Hello" },
  });

  assert.equal(response.status, 500);
  assert.deepEqual(response.headers, { "content-type": "application/json; charset=utf-8" });
  assert.deepEqual(response.body, {
    error: {
      code: "internal_error",
      message: "Chat module request failed.",
      status: 500,
    },
  });
  assert.equal(JSON.stringify(response).includes("provider"), false);
  assert.equal(JSON.stringify(response).includes("secret"), false);
});

test("enabled chat module returned 4xx platform errors preserve safe public fields only", async () => {
  const chatModule: StandaloneApiChatModule = {
    createReservationSession() {
      return { body: { chat_session_id: "session_123", status: "active" } };
    },
    sendMessage() {
      return {
        status: 409,
        headers: { "x-provider-secret": "sk-provider-secret" },
        body: {
          error: {
            code: "conflict",
            message: "Reservation intent is no longer available.",
            status: 409,
            request_id: "req_chat_123",
            retryable: false,
            documentation_url: "https://docs.example.test/chat-errors",
            idempotency: {
              key: "idem_chat_123",
              status: "rejected",
              replayed: false,
              secret: "sk-provider-secret",
            },
            details: { provider: "internal-llm", secret: "sk-provider-secret" },
            causes: [{ message: "provider timeout" }],
            provider: "internal-llm",
          },
        },
      };
    },
    streamMessage() {
      return { body: "" };
    },
    confirmReservation() {
      return { body: {} };
    },
  };
  const handler = createStandaloneApiHandler({ chatModule });

  const response = await handler({
    method: "POST",
    path: "/v1/chat/reservation-sessions/session_123/messages",
    body: { message: "Hello" },
  });

  assert.equal(response.status, 409);
  assert.deepEqual(response.headers, { "content-type": "application/json; charset=utf-8" });
  assert.deepEqual(response.body, {
    error: {
      code: "conflict",
      message: "Reservation intent is no longer available.",
      status: 409,
      request_id: "req_chat_123",
      retryable: false,
      documentation_url: "https://docs.example.test/chat-errors",
      idempotency: {
        key: "idem_chat_123",
        status: "rejected",
        replayed: false,
      },
    },
  });
  assert.equal(JSON.stringify(response).includes("provider"), false);
  assert.equal(JSON.stringify(response).includes("secret"), false);
});

test("enabled chat module returned 4xx provider errors are sanitized", async () => {
  const chatModule: StandaloneApiChatModule = {
    createReservationSession() {
      return { body: { chat_session_id: "session_123", status: "active" } };
    },
    sendMessage() {
      return {
        status: 409,
        body: {
          error: {
            code: "provider_conflict",
            message: "provider api key sk-provider-secret failed",
            status: 409,
          },
        },
      };
    },
    streamMessage() {
      return { body: "" };
    },
    confirmReservation() {
      return { body: {} };
    },
  };
  const handler = createStandaloneApiHandler({ chatModule });

  const response = await handler({
    method: "POST",
    path: "/v1/chat/reservation-sessions/session_123/messages",
    body: { message: "Hello" },
  });

  assert.equal(response.status, 409);
  assert.deepEqual(response.body, {
    error: {
      code: "bad_request",
      message: "Chat module request failed.",
      status: 409,
    },
  });
  assert.equal(JSON.stringify(response).includes("provider"), false);
  assert.equal(JSON.stringify(response).includes("secret"), false);
});

test("unknown standalone routes return not_found", async () => {
  const response = await handleStandaloneApiRequest({
    method: "GET",
    path: "/v1/chat/reservation-sessions/session_123/confirm",
  });

  assert.equal(response.status, 404);
  assert.deepEqual(response.body, {
    error: {
      code: "not_found",
      message: "Route not found.",
      status: 404,
    },
  });
});

test("standalone chat skeleton does not invent a session-root POST endpoint", async () => {
  const response = await handleStandaloneApiRequest({
    method: "POST",
    path: "/v1/chat/reservation-sessions/session_123",
  });

  assert.equal(response.status, 404);
  assert.deepEqual(response.body, {
    error: {
      code: "not_found",
      message: "Route not found.",
      status: 404,
    },
  });
});

test("catalog GET routes use an injected repository and platform response mapping", async () => {
  const handler = createStandaloneApiHandler({ catalogRepository: catalogRepository() });

  assert.deepEqual((await handler({ method: "GET", path: "/v1/venues" })).body, {
    venues: [{
      venue_id: "venue_1",
      tenant_id: "tenant_1",
      name: "Main venue",
      timezone: "Asia/Kuala_Lumpur",
      metadata: undefined,
    }],
  });
  assert.deepEqual((await handler({ method: "GET", path: "/v1/venues/venue_1" })).body, {
    venue_id: "venue_1",
    tenant_id: "tenant_1",
    name: "Main venue",
    timezone: "Asia/Kuala_Lumpur",
    metadata: undefined,
  });
  assert.deepEqual((await handler({ method: "GET", path: "/v1/services" })).body, {
    services: [{
      service_id: "service_1",
      venue_id: "venue_1",
      name: "Simulator",
      description: undefined,
      duration_minutes: undefined,
      total_quantity: undefined,
      resource_kind: undefined,
      resource_strategy: "assigned_resource",
      reservation_policy: undefined,
      resources: undefined,
      layout: undefined,
      metadata: undefined,
    }],
  });
  assert.deepEqual((await handler({ method: "GET", path: "/v1/services/service_1" })).body, {
    service_id: "service_1",
    venue_id: "venue_1",
    name: "Simulator",
    description: undefined,
    duration_minutes: undefined,
    total_quantity: undefined,
    resource_kind: undefined,
    resource_strategy: "assigned_resource",
    reservation_policy: undefined,
    resources: undefined,
    layout: undefined,
    metadata: undefined,
  });
  assert.deepEqual((await handler({ method: "GET", path: "/v1/resources" })).body, {
    resources: [{
      resource_id: "resource_1",
      service_id: "service_1",
      label: "Rig 1",
      kind: "station",
      is_active: true,
      capacity: 1,
      metadata: undefined,
    }],
  });
  assert.deepEqual((await handler({ method: "GET", path: "/v1/resources/resource_1" })).body, {
    resource_id: "resource_1",
    service_id: "service_1",
    label: "Rig 1",
    kind: "station",
    is_active: true,
    capacity: 1,
    metadata: undefined,
  });
  assert.deepEqual((await handler({ method: "GET", path: "/v1/resource-layouts/layout_1" })).body, {
    layout_id: "layout_1",
    service_id: "service_1",
    kind: "grid",
    metadata: {
      columns: 2,
      rows: 1,
    },
    resources: undefined,
  });
});

test("catalog resource list passes service_id query to the injected repository", async () => {
  const calls: Array<{ serviceId?: string | null }> = [];
  const handler = createStandaloneApiHandler({
    catalogRepository: catalogRepository({
      async listResources(input) {
        calls.push(input ?? {});
        return { data: [] };
      },
    }),
  });

  const response = await handler({ method: "GET", path: "/v1/resources?service_id=service_123" });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { resources: [] });
  assert.deepEqual(calls, [{ serviceId: "service_123" }]);
});

test("catalog get route maps repository missing row to not_found", async () => {
  const handler = createStandaloneApiHandler({
    catalogRepository: catalogRepository({
      async getVenue() {
        return { data: null };
      },
    }),
  });

  const response = await handler({ method: "GET", path: "/v1/venues/missing" });

  assert.equal(response.status, 404);
  assert.deepEqual(response.body, {
    error: {
      code: "not_found",
      message: "Venue not found.",
      status: 404,
    },
  });
});

test("catalog routes return a stable platform error when no repository is configured", async () => {
  const response = await handleStandaloneApiRequest({ method: "GET", path: "/v1/venues" });

  assert.equal(response.status, 503);
  assert.deepEqual(response.body, {
    error: {
      code: "bad_request",
      message: "Catalog repository is not configured.",
      status: 503,
    },
  });
  assert.equal(platformErrorResponseSchema.safeParse(response.body).success, true);
});

test("catalog routes map thrown repository failures to stable platform errors", async () => {
  const handler = createStandaloneApiHandler({
    catalogRepository: catalogRepository({
      async listVenues() {
        throw new Error("storage connection reset");
      },
    }),
  });

  const response = await handler({ method: "GET", path: "/v1/venues" });

  assert.equal(response.status, 500);
  assert.deepEqual(response.body, {
    error: {
      code: "internal_error",
      message: "Failed to fetch venues.",
      status: 500,
    },
  });
  assert.equal(platformErrorResponseSchema.safeParse(response.body).success, true);
});

test("availability GET route uses an injected repository and platform response mapping", async () => {
  let repositoryCall: unknown;
  const handler = createStandaloneApiHandler({
    availabilityRepository: availabilityRepository({
      async readAvailability(input) {
        repositoryCall = input;
        return {
          service: availabilityService(),
          bookings: [],
          maintenanceResourceLabels: [],
        };
      },
    }),
  });

  const response = await handler({ method: "GET", path: "/v1/availability?service_id=svc_123&date=2026-07-01" });

  assert.equal(response.status, 200);
  assert.deepEqual(repositoryCall, {
    serviceId: "svc_123",
    date: "2026-07-01",
  });
  assert.equal(availabilityResponseSchema.safeParse(response.body).success, true);

  const body = response.body as AvailabilityResponse;
  assert.equal(body.total_quantity, 2);
  assert.equal(body.resource_kind, "seat");
  assert.equal(body.resource_strategy, "assigned_resource");
  assert.deepEqual(body.resources?.map((resource) => resource.label), ["A1", "B1"]);
  assert.equal(body.layout?.kind, "grid");
  assert.equal(body.slots.length, 13);
});

test("service-token auth rejects protected data routes before repository work", async () => {
  let repositoryCalls = 0;
  const handler = createStandaloneApiHandler({
    auth: { serviceApiKey: "platform-service-secret" },
    availabilityRepository: availabilityRepository({
      async readAvailability() {
        repositoryCalls += 1;
        return {
          service: availabilityService(),
          bookings: [],
          maintenanceResourceLabels: [],
        };
      },
    }),
  });

  const missingBearer = await handler({
    method: "GET",
    path: "/v1/availability?service_id=svc_123&date=2026-07-01",
  });
  const wrongBearer = await handler({
    method: "GET",
    path: "/v1/availability?service_id=svc_123&date=2026-07-01",
    headers: { Authorization: "Bearer wrong-secret" },
  });
  const nonBearer = await handler({
    method: "GET",
    path: "/v1/availability?service_id=svc_123&date=2026-07-01",
    headers: { Authorization: "Basic platform-service-secret" },
  });
  const correctBearer = await handler({
    method: "GET",
    path: "/v1/availability?service_id=svc_123&date=2026-07-01",
    headers: { Authorization: "Bearer platform-service-secret" },
  });

  assert.equal(missingBearer.status, 401);
  assert.deepEqual(missingBearer.body, {
    error: {
      code: "unauthorized",
      message: "Missing bearer token.",
      status: 401,
    },
  });
  assert.equal(wrongBearer.status, 403);
  assert.deepEqual(wrongBearer.body, {
    error: {
      code: "forbidden",
      message: "Invalid service bearer token.",
      status: 403,
    },
  });
  assert.equal(nonBearer.status, 401);
  assert.deepEqual(nonBearer.body, {
    error: {
      code: "unauthorized",
      message: "Authorization header must use Bearer authentication.",
      status: 401,
    },
  });
  assert.equal(correctBearer.status, 200);
  assert.equal(repositoryCalls, 1);
});

test("bearer verifier accepts a user token and protected routes proceed with injected repositories", async () => {
  const verifierCalls: string[] = [];
  let repositoryCalls = 0;
  const handler = createStandaloneApiHandler({
    auth: {
      verifyBearerToken(input) {
        verifierCalls.push(input.token);
        assert.equal(input.requestContext.tenantId, "tenant_1");
        return {
          ok: true,
          principal: userPrincipal({
            subjectId: "user_1",
            tenantIds: ["tenant_1"],
          }),
        };
      },
      requireTenant: true,
    },
    availabilityRepository: availabilityRepository({
      async readAvailability() {
        repositoryCalls += 1;
        return {
          service: availabilityService(),
          bookings: [],
          maintenanceResourceLabels: [],
        };
      },
    }),
  });

  const response = await handler({
    method: "GET",
    path: "/v1/availability?service_id=svc_123&date=2026-07-01",
    headers: {
      Authorization: "Bearer user-token",
      "X-Reservation-Tenant-Id": "tenant_1",
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(verifierCalls, ["user-token"]);
  assert.equal(repositoryCalls, 1);
});

test("bearer verifier runs before idempotency, body validation, and repository work for protected mutations", async () => {
  const calls: string[] = [];
  const idempotencyRepository = new InMemoryIdempotencyRepository();
  const handler = createStandaloneApiHandler({
    auth: {
      verifyBearerToken() {
        calls.push("verify");
        return rejectedAuthResult();
      },
    },
    idempotencyRepository: {
      claimInProgress(record) {
        calls.push("idempotency");
        return idempotencyRepository.claimInProgress(record);
      },
      storeCompleted(record) {
        calls.push("idempotency");
        idempotencyRepository.storeCompleted(record);
      },
    },
    reservationCreateRepository: reservationCreateRepository({
      async createReservationAtomic() {
        calls.push("repository");
        throw new Error("verifier should block mutation before repository work");
      },
    }),
  });

  const response = await handler({
    method: "POST",
    path: "/v1/reservations",
    headers: {
      Authorization: "Bearer rejected-user-token",
      "Idempotency-Key": "idem_verifier_preflight_123",
    },
    body: null,
  });

  assert.equal(response.status, 401);
  assert.deepEqual(response.body, rejectedAuthBody());
  assert.deepEqual(calls, ["verify"]);
  assert.equal(idempotencyRepository.records.size, 0);
});

test("bearer verifier principals are checked for tenant, venue, roles, scopes, and repository-backed context", async () => {
  const cases: Array<{
    name: string;
    principal: AuthenticatedPlatformPrincipal;
    expectedStatus: number;
    expectedBody: unknown;
    tenantVenueRepository?: PlatformTenantVenueRepository;
  }> = [
    {
      name: "tenant access",
      principal: userPrincipal({ tenantIds: ["tenant_other"], roles: ["admin"], scopes: ["reservations:read"] }),
      expectedStatus: 403,
      expectedBody: {
        error: {
          code: "forbidden",
          message: "Authenticated principal is not allowed to access this tenant.",
          status: 403,
          details: { tenant_id: "tenant_1" },
        },
      },
    },
    {
      name: "venue access",
      principal: userPrincipal({
        tenantIds: ["tenant_1"],
        venueIds: ["venue_other"],
        roles: ["admin"],
        scopes: ["reservations:read"],
      }),
      expectedStatus: 403,
      expectedBody: {
        error: {
          code: "forbidden",
          message: "Authenticated principal is not allowed to access this venue.",
          status: 403,
          details: { venue_id: "venue_1" },
        },
      },
    },
    {
      name: "role access",
      principal: userPrincipal({ tenantIds: ["tenant_1"], roles: ["viewer"], scopes: ["reservations:read"] }),
      expectedStatus: 403,
      expectedBody: {
        error: {
          code: "forbidden",
          message: "Authenticated principal is missing required roles.",
          status: 403,
          details: { missing_roles: ["admin"] },
        },
      },
    },
    {
      name: "scope access",
      principal: userPrincipal({ tenantIds: ["tenant_1"], roles: ["admin"], scopes: ["catalog:read"] }),
      expectedStatus: 403,
      expectedBody: {
        error: {
          code: "forbidden",
          message: "Authenticated principal is missing required scopes.",
          status: 403,
          details: { missing_scopes: ["reservations:read"] },
        },
      },
    },
    {
      name: "repository context",
      principal: userPrincipal({ tenantIds: ["tenant_1"], roles: ["admin"], scopes: ["reservations:read"] }),
      tenantVenueRepository: tenantVenueRepository({
        async getVenue() {
          return { data: { id: "venue_1", tenant_id: "tenant_other" } };
        },
      }),
      expectedStatus: 403,
      expectedBody: {
        error: {
          code: "forbidden",
          message: "Venue does not belong to the requested tenant.",
          status: 403,
          details: {
            reason: "venue_tenant_mismatch",
            tenant_id: "tenant_1",
            venue_id: "venue_1",
          },
        },
      },
    },
  ];

  for (const testCase of cases) {
    let repositoryCalled = false;
    const handler = createStandaloneApiHandler({
      auth: {
        verifyBearerToken: () => ({ ok: true, principal: testCase.principal }),
        requireTenant: true,
        requiredRoles: ["admin"],
        requiredScopes: ["reservations:read"],
      },
      catalogRepository: catalogRepository({
        async listVenues() {
          repositoryCalled = true;
          throw new Error(`should not read catalog for ${testCase.name}`);
        },
      }),
      tenantVenueRepository: testCase.tenantVenueRepository,
    });

    const response = await handler({
      method: "GET",
      path: "/v1/venues",
      headers: {
        Authorization: "Bearer user-token",
        "X-Reservation-Tenant-Id": "tenant_1",
        "X-Reservation-Venue-Id": "venue_1",
      },
    });

    assert.equal(repositoryCalled, false, testCase.name);
    assert.equal(response.status, testCase.expectedStatus, testCase.name);
    assert.deepEqual(response.body, testCase.expectedBody, testCase.name);
  }
});

test("bearer verifier rejected and thrown results fail closed without provider internals or route repos", async () => {
  const cases = [
    {
      name: "rejected",
      verifyBearerToken: () => rejectedAuthResult("provider-specific detail"),
      expectedStatus: 401,
      expectedBody: rejectedAuthBody(),
    },
    {
      name: "thrown",
      verifyBearerToken: () => {
        throw new Error("jwt provider stack and secret detail");
      },
      expectedStatus: 500,
      expectedBody: {
        error: {
          code: "internal_error",
          message: "Failed to verify bearer token.",
          status: 500,
        },
      },
    },
  ];

  for (const testCase of cases) {
    let repositoryCalled = false;
    const handler = createStandaloneApiHandler({
      auth: { verifyBearerToken: testCase.verifyBearerToken },
      reservationReadRepository: reservationReadRepository({
        async listReservations() {
          repositoryCalled = true;
          throw new Error(`should not read reservations for ${testCase.name}`);
        },
      }),
    });

    const response = await handler({
      method: "GET",
      path: "/v1/reservations",
      headers: { Authorization: "Bearer user-token" },
    });

    assert.equal(repositoryCalled, false, testCase.name);
    assert.equal(response.status, testCase.expectedStatus, testCase.name);
    assert.deepEqual(response.body, testCase.expectedBody, testCase.name);
    assert.equal(JSON.stringify(response.body).includes("provider"), false, testCase.name);
    assert.equal(JSON.stringify(response.body).includes("secret"), false, testCase.name);
  }
});

test("service-token compatibility remains preferred when both service key and verifier are configured", async () => {
  const verifierTokens: string[] = [];
  let repositoryCalls = 0;
  const handler = createStandaloneApiHandler({
    auth: {
      serviceApiKey: "platform-service-secret",
      verifyBearerToken(input) {
        verifierTokens.push(input.token);
        return {
          ok: true,
          principal: userPrincipal({
            subjectId: "user_1",
            tenantIds: ["tenant_1"],
          }),
        };
      },
      requireTenant: true,
    },
    availabilityRepository: availabilityRepository({
      async readAvailability() {
        repositoryCalls += 1;
        return {
          service: availabilityService(),
          bookings: [],
          maintenanceResourceLabels: [],
        };
      },
    }),
  });

  const serviceResponse = await handler({
    method: "GET",
    path: "/v1/availability?service_id=svc_123&date=2026-07-01",
    headers: {
      Authorization: "Bearer platform-service-secret",
      "X-Reservation-Tenant-Id": "tenant_1",
    },
  });
  const userResponse = await handler({
    method: "GET",
    path: "/v1/availability?service_id=svc_123&date=2026-07-01",
    headers: {
      Authorization: "Bearer user-token",
      "X-Reservation-Tenant-Id": "tenant_1",
    },
  });

  assert.equal(serviceResponse.status, 200);
  assert.equal(userResponse.status, 200);
  assert.deepEqual(verifierTokens, ["user-token"]);
  assert.equal(repositoryCalls, 2);
});

test("service-token auth protects each platform data route class before route dependencies", async () => {
  const routes = [
    { method: "GET", path: "/v1/venues" },
    { method: "GET", path: "/v1/services/service_1" },
    { method: "GET", path: "/v1/resources/resource_1" },
    { method: "GET", path: "/v1/resource-layouts/layout_1" },
    { method: "GET", path: "/v1/availability?service_id=svc_123&date=2026-07-01" },
    { method: "GET", path: "/v1/reservations" },
    { method: "GET", path: `/v1/reservations/${validReservationId()}` },
    {
      method: "POST",
      path: "/v1/reservations",
      headers: { "Idempotency-Key": "idem_auth_matrix_create" },
      body: validCreateReservationBody(),
    },
    {
      method: "PATCH",
      path: `/v1/reservations/${validReservationId()}`,
      headers: { "Idempotency-Key": "idem_auth_matrix_update" },
      body: { status: "completed" },
    },
    {
      method: "POST",
      path: `/v1/reservations/${validReservationId()}/reschedule`,
      headers: { "Idempotency-Key": "idem_auth_matrix_reschedule" },
      body: {
        date: "2026-07-02",
        start_time: "15:00",
        end_time: "16:00",
        quantity: 1,
        resource_ids: ["A1"],
      },
    },
    {
      method: "POST",
      path: `/v1/reservations/${validReservationId()}/cancel`,
      headers: { "Idempotency-Key": "idem_auth_matrix_cancel" },
      body: {},
    },
    { method: "GET", path: "/v1/resource-maintenance?service_id=svc_123" },
    {
      method: "POST",
      path: "/v1/resource-maintenance",
      body: { service_id: "svc_123", resource_id: "res_a" },
    },
    { method: "POST", path: "/v1/resource-maintenance/maint_123/end", body: {} },
  ];
  let dependencyCalls = 0;
  let idempotencyCalls = 0;
  const idempotencyRepository = new InMemoryIdempotencyRepository();
  const handler = createStandaloneApiHandler({
    auth: { serviceApiKey: "platform-service-secret" },
    availabilityRepository: availabilityRepository({
      async readAvailability() {
        dependencyCalls += 1;
        throw new Error("auth should block availability before repository work");
      },
    }),
    catalogRepository: catalogRepository({
      async listVenues() {
        dependencyCalls += 1;
        throw new Error("auth should block catalog before repository work");
      },
      async getService() {
        dependencyCalls += 1;
        throw new Error("auth should block catalog before repository work");
      },
      async getResource() {
        dependencyCalls += 1;
        throw new Error("auth should block catalog before repository work");
      },
      async getResourceLayout() {
        dependencyCalls += 1;
        throw new Error("auth should block catalog before repository work");
      },
    }),
    idempotencyRepository: {
      claimInProgress(record) {
        idempotencyCalls += 1;
        return idempotencyRepository.claimInProgress(record);
      },
      storeCompleted(record) {
        idempotencyCalls += 1;
        idempotencyRepository.storeCompleted(record);
      },
    },
    reservationCreateRepository: reservationCreateRepository({
      async createReservationAtomic() {
        dependencyCalls += 1;
        throw new Error("auth should block reservation create before repository work");
      },
    }),
    reservationMutationRepository: reservationMutationRepository({
      async updateReservation() {
        dependencyCalls += 1;
        throw new Error("auth should block reservation mutation before repository work");
      },
    }),
    reservationReadRepository: reservationReadRepository({
      async listReservations() {
        dependencyCalls += 1;
        throw new Error("auth should block reservation read before repository work");
      },
      async readReservationById() {
        dependencyCalls += 1;
        throw new Error("auth should block reservation read before repository work");
      },
    }),
    resourceMaintenanceRepository: resourceMaintenanceRepository({
      async listActiveMaintenance() {
        dependencyCalls += 1;
        throw new Error("auth should block resource maintenance before repository work");
      },
      async createMaintenance() {
        dependencyCalls += 1;
        throw new Error("auth should block resource maintenance before repository work");
      },
      async endMaintenance() {
        dependencyCalls += 1;
        throw new Error("auth should block resource maintenance before repository work");
      },
    }),
  });

  for (const route of routes) {
    const response = await handler(route);

    assert.equal(response.status, 401, `${route.method} ${route.path}`);
    assert.deepEqual(response.body, {
      error: {
        code: "unauthorized",
        message: "Missing bearer token.",
        status: 401,
      },
    }, `${route.method} ${route.path}`);
  }
  assert.equal(dependencyCalls, 0);
  assert.equal(idempotencyCalls, 0);
  assert.equal(idempotencyRepository.records.size, 0);
});

test("service-token auth leaves metadata route unprotected", async () => {
  const handler = createStandaloneApiHandler({
    auth: { serviceApiKey: "platform-service-secret", requireTenant: true },
  });

  const metadata = await handler({ method: "GET", path: "/v1/metadata" });

  assert.equal(metadata.status, 200);
});

test("service-token auth can require tenant context before repository work", async () => {
  let repositoryCalled = false;
  const handler = createStandaloneApiHandler({
    auth: { serviceApiKey: "platform-service-secret", requireTenant: true },
    availabilityRepository: availabilityRepository({
      async readAvailability() {
        repositoryCalled = true;
        throw new Error("should not read availability without tenant context");
      },
    }),
  });

  const response = await handler({
    method: "GET",
    path: "/v1/availability?service_id=svc_123&date=2026-07-01",
    headers: { Authorization: "Bearer platform-service-secret" },
  });

  assert.equal(repositoryCalled, false);
  assert.equal(response.status, 400);
  assert.deepEqual(response.body, {
    error: {
      code: "validation_failed",
      message: "Missing tenant context.",
      status: 400,
      details: {
        reason: "tenant_required",
      },
    },
  });
});

test("service-token auth validates tenant and venue context before repository work", async () => {
  const cases = [
    {
      name: "missing tenant record",
      tenantVenueRepository: tenantVenueRepository({
        async getTenant() {
          return { data: null };
        },
      }),
      expectedBody: {
        error: {
          code: "forbidden",
          message: "Authenticated principal is not allowed to access this tenant.",
          status: 403,
          details: {
            reason: "tenant_inaccessible",
          },
        },
      },
    },
    {
      name: "venue tenant mismatch",
      tenantVenueRepository: tenantVenueRepository({
        async getVenue() {
          return { data: { id: "venue_1", tenant_id: "tenant_other" } };
        },
      }),
      expectedBody: {
        error: {
          code: "forbidden",
          message: "Venue does not belong to the requested tenant.",
          status: 403,
          details: {
            reason: "venue_tenant_mismatch",
            tenant_id: "tenant_1",
            venue_id: "venue_1",
          },
        },
      },
    },
  ];

  for (const testCase of cases) {
    let catalogCalled = false;
    const handler = createStandaloneApiHandler({
      auth: { serviceApiKey: "platform-service-secret", requireTenant: true },
      catalogRepository: catalogRepository({
        async listVenues() {
          catalogCalled = true;
          throw new Error(`should not read catalog for ${testCase.name}`);
        },
      }),
      tenantVenueRepository: testCase.tenantVenueRepository,
    });

    const response = await handler({
      method: "GET",
      path: "/v1/venues",
      headers: {
        Authorization: "Bearer platform-service-secret",
        "X-Reservation-Tenant-Id": "tenant_1",
        "X-Reservation-Venue-Id": "venue_1",
      },
    });

    assert.equal(catalogCalled, false, testCase.name);
    assert.equal(response.status, 403, testCase.name);
    assert.deepEqual(response.body, testCase.expectedBody, testCase.name);
  }
});

test("availability GET route maps query validation errors before storage work", async () => {
  let repositoryCalled = false;
  const handler = createStandaloneApiHandler({
    availabilityRepository: availabilityRepository({
      async readAvailability() {
        repositoryCalled = true;
        throw new Error("should not read availability for invalid query");
      },
    }),
  });

  const response = await handler({ method: "GET", path: "/v1/availability?service_id=svc_123" });

  assert.equal(repositoryCalled, false);
  assert.equal(response.status, 400);
  assert.deepEqual(response.body, {
    error: {
      code: "validation_failed",
      message: "service_id and date are required.",
      status: 400,
    },
  });
  assert.equal(platformErrorResponseSchema.safeParse(response.body).success, true);
});

test("availability route returns a stable platform error when no repository is configured", async () => {
  const response = await handleStandaloneApiRequest({
    method: "GET",
    path: "/v1/availability?service_id=svc_123&date=2026-07-01",
  });

  assert.equal(response.status, 503);
  assert.deepEqual(response.body, {
    error: {
      code: "bad_request",
      message: "Availability repository is not configured.",
      status: 503,
    },
  });
  assert.equal(platformErrorResponseSchema.safeParse(response.body).success, true);
});

test("availability query validation runs before missing repository configuration", async () => {
  const response = await handleStandaloneApiRequest({
    method: "GET",
    path: "/v1/availability?service_id=svc_123",
  });

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, {
    error: {
      code: "validation_failed",
      message: "service_id and date are required.",
      status: 400,
    },
  });
});

test("resource maintenance list route uses an injected repository and platform response mapping", async () => {
  let repositoryCall: string | undefined;
  const handler = createStandaloneApiHandler({
    resourceMaintenanceRepository: resourceMaintenanceRepository({
      async listActiveMaintenance(serviceId) {
        repositoryCall = serviceId;
        return { data: [resourceMaintenanceRow()] };
      },
    }),
  });

  const response = await handler({
    method: "GET",
    path: "/v1/resource-maintenance?service_id=svc_123",
  });

  assert.equal(response.status, 200);
  assert.equal(repositoryCall, "svc_123");
  assert.equal(listResourceMaintenanceResponseSchema.safeParse(response.body).success, true);
  assert.deepEqual(response.body, {
    maintenance: [resourceMaintenanceBody()],
  });
});

test("resource maintenance list validates service_id before repository configuration or storage work", async () => {
  let repositoryCalled = false;
  const handler = createStandaloneApiHandler({
    resourceMaintenanceRepository: resourceMaintenanceRepository({
      async listActiveMaintenance() {
        repositoryCalled = true;
        throw new Error("should not list maintenance for invalid query");
      },
    }),
  });

  const invalidWithRepository = await handler({
    method: "GET",
    path: "/v1/resource-maintenance",
  });
  const invalidWithoutRepository = await handleStandaloneApiRequest({
    method: "GET",
    path: "/v1/resource-maintenance",
  });

  for (const response of [invalidWithRepository, invalidWithoutRepository]) {
    assert.equal(response.status, 400);
    assert.deepEqual(response.body, {
      error: {
        code: "validation_failed",
        message: "service_id is required.",
        status: 400,
      },
    });
    assert.equal(platformErrorResponseSchema.safeParse(response.body).success, true);
  }
  assert.equal(repositoryCalled, false);
});

test("resource maintenance create route delegates resolve, service load, create, and maps response status", async () => {
  const calls: unknown[] = [];
  const handler = createStandaloneApiHandler({
    idempotencyRepository: new InMemoryIdempotencyRepository(),
    resourceMaintenanceRepository: resourceMaintenanceRepository({
      async resolveResource(input) {
        calls.push({ method: "resolveResource", input });
        return { serviceId: "svc_123", label: "A1" };
      },
      async loadService(serviceId) {
        calls.push({ method: "loadService", serviceId });
        return {
          data: {
            selection_mode: "assigned_resource",
            resources: [{ label: "A1", is_active: true }],
          },
        };
      },
      async createMaintenance(row) {
        calls.push({ method: "createMaintenance", row });
        return {
          data: resourceMaintenanceRow({
            service_id: row.service_id,
            seat_label: row.seat_label,
            reason: row.reason,
          }),
        };
      },
    }),
  });

  const body = {
    service_id: "svc_123",
    resource_id: "res_a",
    reason: "Cleaning",
    metadata: {
      source: "standalone-api-test",
    },
  };
  const response = await handler({
    method: "POST",
    path: "/v1/resource-maintenance",
    headers: { "Idempotency-Key": "idem_maintenance_create_success_123" },
    body,
  });

  assert.equal(response.status, 201);
  assert.equal(resourceMaintenanceResponseSchema.safeParse(response.body).success, true);
  assert.deepEqual(response.body, resourceMaintenanceBody({
    reason: "Cleaning",
    metadata: { resource_label: "A1" },
  }));
  assert.deepEqual(calls, [
    { method: "resolveResource", input: body },
    { method: "loadService", serviceId: "svc_123" },
    {
      method: "createMaintenance",
      row: {
        service_id: "svc_123",
        seat_label: "A1",
        reason: "Cleaning",
        is_active: true,
        created_by: null,
      },
    },
  ]);
});

test("resource maintenance end route delegates endMaintenance and maps response status", async () => {
  let repositoryCall: unknown;
  const handler = createStandaloneApiHandler({
    idempotencyRepository: new InMemoryIdempotencyRepository(),
    resourceMaintenanceRepository: resourceMaintenanceRepository({
      async endMaintenance(id, input) {
        repositoryCall = { id, input };
        return {
          data: resourceMaintenanceRow({
            id,
            ends_at: "2026-07-03T12:00:00.000Z",
            reason: input?.reason,
          }),
        };
      },
    }),
  });

  const response = await handler({
    method: "POST",
    path: "/v1/resource-maintenance/maint_123/end",
    headers: { "Idempotency-Key": "idem_maintenance_end_success_123" },
    body: { reason: "Back online" },
  });

  assert.equal(response.status, 200);
  assert.equal(resourceMaintenanceResponseSchema.safeParse(response.body).success, true);
  assert.deepEqual(response.body, resourceMaintenanceBody({
    maintenance_id: "maint_123",
    ends_at: "2026-07-03T12:00:00.000Z",
    reason: "Back online",
  }));
  assert.deepEqual(repositoryCall, {
    id: "maint_123",
    input: { reason: "Back online" },
  });
});

test("resource maintenance routes return a stable platform error when no repository is configured", async () => {
  const responses = [
    await handleStandaloneApiRequest({
      method: "GET",
      path: "/v1/resource-maintenance?service_id=svc_123",
    }),
    await createStandaloneApiHandler({
      idempotencyRepository: new InMemoryIdempotencyRepository(),
    })({
      method: "POST",
      path: "/v1/resource-maintenance",
      headers: { "Idempotency-Key": "idem_maintenance_missing_repository_123" },
      body: {
        service_id: "svc_123",
        resource_id: "res_a",
      },
    }),
    await createStandaloneApiHandler({
      idempotencyRepository: new InMemoryIdempotencyRepository(),
    })({
      method: "POST",
      path: "/v1/resource-maintenance/maint_123/end",
      headers: { "Idempotency-Key": "idem_maintenance_missing_repository_end_123" },
      body: {},
    }),
  ];

  for (const response of responses) {
    assert.equal(response.status, 503);
    assert.deepEqual(response.body, {
      error: {
        code: "bad_request",
        message: "Resource maintenance repository is not configured.",
        status: 503,
      },
    });
    assert.equal(platformErrorResponseSchema.safeParse(response.body).success, true);
  }
});

test("resource maintenance mutations require idempotency before body or repository work", async () => {
  let repositoryCalled = false;
  const handler = createStandaloneApiHandler({
    idempotencyRepository: new InMemoryIdempotencyRepository(),
    resourceMaintenanceRepository: resourceMaintenanceRepository({
      async createMaintenance() {
        repositoryCalled = true;
        throw new Error("should not create maintenance without idempotency key");
      },
      async endMaintenance() {
        repositoryCalled = true;
        throw new Error("should not end maintenance without idempotency key");
      },
    }),
  });

  const responses = [
    await handler({
      method: "POST",
      path: "/v1/resource-maintenance",
      body: null,
    }),
    await handler({
      method: "POST",
      path: "/v1/resource-maintenance/maint_123/end",
      body: null,
    }),
  ];

  for (const response of responses) {
    assert.equal(response.status, 400);
    assert.deepEqual(response.body, {
      error: {
        code: "missing_idempotency_key",
        message: "Missing Idempotency-Key header for mutation.",
        status: 400,
        idempotency: {
          status: "rejected",
        },
      },
    });
    assert.equal(platformErrorResponseSchema.safeParse(response.body).success, true);
  }
  assert.equal(repositoryCalled, false);
});

test("resource maintenance mutations require idempotency storage when a key is present", async () => {
  let repositoryCalled = false;
  const handler = createStandaloneApiHandler({
    resourceMaintenanceRepository: resourceMaintenanceRepository({
      async createMaintenance() {
        repositoryCalled = true;
        throw new Error("should not create maintenance without idempotency storage");
      },
      async endMaintenance() {
        repositoryCalled = true;
        throw new Error("should not end maintenance without idempotency storage");
      },
    }),
  });

  const responses = [
    await handler({
      method: "POST",
      path: "/v1/resource-maintenance",
      headers: { "Idempotency-Key": "idem_maintenance_missing_idem_123" },
      body: { service_id: "svc_123", resource_id: "res_a" },
    }),
    await handler({
      method: "POST",
      path: "/v1/resource-maintenance/maint_123/end",
      headers: { "Idempotency-Key": "idem_maintenance_missing_idem_end_123" },
      body: {},
    }),
  ];

  for (const response of responses) {
    assert.equal(response.status, 503);
    assert.deepEqual(response.body, {
      error: {
        code: "bad_request",
        message: "Idempotency repository is not configured.",
        status: 503,
      },
    });
  }
  assert.equal(repositoryCalled, false);
});

test("resource maintenance mutations prefer missing idempotency storage when both mutation dependencies are absent", async () => {
  const responses = [
    await handleStandaloneApiRequest({
      method: "POST",
      path: "/v1/resource-maintenance",
      headers: { "Idempotency-Key": "idem_maintenance_both_missing_123" },
      body: { service_id: "svc_123", resource_id: "res_a" },
    }),
    await handleStandaloneApiRequest({
      method: "POST",
      path: "/v1/resource-maintenance/maint_123/end",
      headers: { "Idempotency-Key": "idem_maintenance_both_missing_end_123" },
      body: {},
    }),
  ];

  for (const response of responses) {
    assert.equal(response.status, 503);
    assert.deepEqual(response.body, {
      error: {
        code: "bad_request",
        message: "Idempotency repository is not configured.",
        status: 503,
      },
    });
  }
});

test("resource maintenance mutations do not commit invalid bodies after a valid key", async () => {
  const idempotencyRepository = new InMemoryIdempotencyRepository();
  const handler = createStandaloneApiHandler({
    idempotencyRepository,
    resourceMaintenanceRepository: resourceMaintenanceRepository(),
  });

  const responses = [
    await handler({
      method: "POST",
      path: "/v1/resource-maintenance",
      headers: { "Idempotency-Key": "idem_maintenance_invalid_body_123" },
      body: {},
    }),
    await handler({
      method: "POST",
      path: "/v1/resource-maintenance/maint_123/end",
      headers: { "Idempotency-Key": "idem_maintenance_invalid_body_end_123" },
      body: { metadata: "unsupported" },
    }),
  ];

  for (const response of responses) {
    assert.equal(response.status, 400);
    assert.equal((response.body as { error: { code: string } }).error.code, "validation_failed");
  }
  for (const record of idempotencyRepository.records.values()) {
    assert.notEqual(record.status, "completed");
  }
});

test("resource maintenance mutations replay completed idempotent responses without a second mutation", async () => {
  let createCalls = 0;
  let endCalls = 0;
  const handler = createStandaloneApiHandler({
    idempotencyRepository: new InMemoryIdempotencyRepository(),
    resourceMaintenanceRepository: resourceMaintenanceRepository({
      async createMaintenance(row) {
        createCalls += 1;
        return { data: resourceMaintenanceRow({ ...row }) };
      },
      async endMaintenance(id, input) {
        endCalls += 1;
        return {
          data: resourceMaintenanceRow({
            id,
            ends_at: "2026-07-02T00:00:00.000Z",
            reason: input?.reason,
          }),
        };
      },
    }),
  });
  const createRequest = {
    method: "POST",
    path: "/v1/resource-maintenance",
    headers: { "Idempotency-Key": "idem_maintenance_create_replay_123" },
    body: { service_id: "svc_123", resource_id: "A1", reason: "Cleaning" },
  };
  const endRequest = {
    method: "POST",
    path: "/v1/resource-maintenance/maint_123/end",
    headers: { "Idempotency-Key": "idem_maintenance_end_replay_123" },
    body: { reason: "Done" },
  };

  const firstCreate = await handler(createRequest);
  const secondCreate = await handler(createRequest);
  const firstEnd = await handler(endRequest);
  const secondEnd = await handler(endRequest);

  assert.equal(firstCreate.status, 201);
  assert.equal(secondCreate.status, 201);
  assert.deepEqual(secondCreate.body, firstCreate.body);
  assert.equal(firstEnd.status, 200);
  assert.equal(secondEnd.status, 200);
  assert.deepEqual(secondEnd.body, firstEnd.body);
  assert.equal(createCalls, 1);
  assert.equal(endCalls, 1);
});

test("resource maintenance mutations reject idempotency key reuse with a different body or path", async () => {
  let mutationCalls = 0;
  const handler = createStandaloneApiHandler({
    idempotencyRepository: new InMemoryIdempotencyRepository(),
    resourceMaintenanceRepository: resourceMaintenanceRepository({
      async createMaintenance(row) {
        mutationCalls += 1;
        return { data: resourceMaintenanceRow({ ...row }) };
      },
      async endMaintenance(id, input) {
        mutationCalls += 1;
        return { data: resourceMaintenanceRow({ id, reason: input?.reason }) };
      },
    }),
  });

  const first = await handler({
    method: "POST",
    path: "/v1/resource-maintenance",
    headers: { "Idempotency-Key": "idem_maintenance_misuse_123" },
    body: { service_id: "svc_123", resource_id: "A1", reason: "Cleaning" },
  });
  const differentBody = await handler({
    method: "POST",
    path: "/v1/resource-maintenance",
    headers: { "Idempotency-Key": "idem_maintenance_misuse_123" },
    body: { service_id: "svc_123", resource_id: "A1", reason: "Repair" },
  });
  const differentPath = await handler({
    method: "POST",
    path: "/v1/resource-maintenance/maint_123/end",
    headers: { "Idempotency-Key": "idem_maintenance_misuse_123" },
    body: { reason: "Cleaning" },
  });

  assert.equal(first.status, 201);
  for (const response of [differentBody, differentPath]) {
    assert.equal(response.status, 409);
    assert.deepEqual(response.body, {
      error: {
        code: "idempotency_key_reused_with_different_request",
        message: "Idempotency key was already used for a different mutation request.",
        status: 409,
        idempotency: {
          key: "idem_maintenance_misuse_123",
          status: "rejected",
        },
      },
    });
  }
  assert.equal(mutationCalls, 1);
});

test("reservation list route uses an injected repository and platform response mapping", async () => {
  let repositoryCall: unknown;
  const handler = createStandaloneApiHandler({
    reservationReadRepository: reservationReadRepository({
      async listReservations(input) {
        repositoryCall = input;
        return { data: [reservationRow()] };
      },
    }),
  });

  const response = await handler({ method: "GET", path: "/v1/reservations" });

  assert.equal(response.status, 200);
  assert.deepEqual(repositoryCall, {
    search: null,
    searchFilterExpression: null,
    limit: null,
  });
  assert.equal(listReservationsResponseSchema.safeParse(response.body).success, true);
  assert.deepEqual(response.body, {
    reservations: [reservationBody()],
  });
});

test("reservation list route includes optional repository summary", async () => {
  const handler = createStandaloneApiHandler({
    reservationReadRepository: reservationReadRepository({
      async listReservations() {
        return { data: [] };
      },
      async getReservationsSummary() {
        return {
          summary: {
            total: 11,
            confirmed_today: 6,
          },
        };
      },
    }),
  });

  const response = await handler({ method: "GET", path: "/v1/reservations" });

  assert.equal(response.status, 200);
  assert.equal(listReservationsResponseSchema.safeParse(response.body).success, true);
  assert.deepEqual(response.body, {
    reservations: [],
    summary: {
      total: 11,
      confirmed_today: 6,
    },
  });
});

test("reservation list route forwards normalized search query to the injected repository", async () => {
  let repositoryCall: unknown;
  const handler = createStandaloneApiHandler({
    reservationReadRepository: reservationReadRepository({
      async listReservations(input) {
        repositoryCall = input;
        return { data: [] };
      },
    }),
  });

  const response = await handler({ method: "GET", path: "/v1/reservations?search=%20Alice%20" });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { reservations: [] });
  assert.deepEqual(repositoryCall, {
    search: "Alice",
    searchFilterExpression: 'user_name.ilike."%Alice%",user_email.ilike."%Alice%",user_phone.ilike."%Alice%"',
    limit: 100,
  });
});

test("reservation read route uses an injected repository and platform response mapping", async () => {
  let repositoryCall: string | undefined;
  const handler = createStandaloneApiHandler({
    reservationReadRepository: reservationReadRepository({
      async readReservationById(reservationId) {
        repositoryCall = reservationId;
        return { data: reservationRow({ id: reservationId }) };
      },
    }),
  });

  const response = await handler({
    method: "GET",
    path: "/v1/reservations/11111111-1111-4111-8111-111111111111",
  });

  assert.equal(response.status, 200);
  assert.equal(repositoryCall, "11111111-1111-4111-8111-111111111111");
  assert.equal(reservationResponseSchema.safeParse(response.body).success, true);
  assert.deepEqual(response.body, reservationBody({ reservation_id: "11111111-1111-4111-8111-111111111111" }));
});

test("reservation read route validates invalid ids before storage work", async () => {
  let repositoryCalled = false;
  const handler = createStandaloneApiHandler({
    reservationReadRepository: reservationReadRepository({
      async readReservationById() {
        repositoryCalled = true;
        throw new Error("should not read reservations for invalid id");
      },
    }),
  });

  const response = await handler({ method: "GET", path: "/v1/reservations/not-a-uuid" });

  assert.equal(repositoryCalled, false);
  assert.equal(response.status, 400);
  assert.deepEqual(response.body, {
    error: {
      code: "validation_failed",
      message: "Invalid reservation id",
      status: 400,
      details: [{
        code: "invalid_string",
        validation: "uuid",
        message: "Invalid uuid",
        path: [],
        received: "not-a-uuid",
      }],
    },
  });
  assert.equal(platformErrorResponseSchema.safeParse(response.body).success, true);
});

test("reservation routes return stable platform errors when no read repository is configured", async () => {
  const listResponse = await handleStandaloneApiRequest({ method: "GET", path: "/v1/reservations" });
  const readResponse = await handleStandaloneApiRequest({
    method: "GET",
    path: "/v1/reservations/11111111-1111-4111-8111-111111111111",
  });

  for (const response of [listResponse, readResponse]) {
    assert.equal(response.status, 503);
    assert.deepEqual(response.body, {
      error: {
        code: "bad_request",
        message: "Reservation read repository is not configured.",
        status: 503,
      },
    });
    assert.equal(platformErrorResponseSchema.safeParse(response.body).success, true);
  }
});

test("reservation create route requires an idempotency key before validation or storage work", async () => {
  let repositoryCalled = false;
  const handler = createStandaloneApiHandler({
    idempotencyRepository: new InMemoryIdempotencyRepository(),
    reservationCreateRepository: reservationCreateRepository({
      async createReservationAtomic() {
        repositoryCalled = true;
        throw new Error("should not create without idempotency key");
      },
    }),
  });

  const response = await handler({
    method: "POST",
    path: "/v1/reservations",
    body: validCreateReservationBody(),
  });

  assert.equal(repositoryCalled, false);
  assert.equal(response.status, 400);
  assert.deepEqual(response.body, {
    error: {
      code: "missing_idempotency_key",
      message: "Missing Idempotency-Key header for mutation.",
      status: 400,
      idempotency: {
        status: "rejected",
      },
    },
  });
  assert.equal(platformErrorResponseSchema.safeParse(response.body).success, true);
});

test("standalone Node server requires an idempotency key before parsing malformed reservation JSON", async () => {
  await withStandaloneNodeServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/reservations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.deepEqual(body, {
      error: {
        code: "missing_idempotency_key",
        message: "Missing Idempotency-Key header for mutation.",
        status: 400,
        idempotency: {
          status: "rejected",
        },
      },
    });
    assert.equal(platformErrorResponseSchema.safeParse(body).success, true);
  });
});

test("standalone Node server returns invalid JSON when reservation idempotency key is present", async () => {
  await withStandaloneNodeServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/reservations`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Idempotency-Key": "idem_malformed_json_123",
      },
      body: "{",
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.deepEqual(body, {
      error: {
        code: "validation_failed",
        message: "Invalid JSON body.",
        status: 400,
      },
    });
    assert.equal(platformErrorResponseSchema.safeParse(body).success, true);
  });
});

test("standalone Node server rejects unauthenticated malformed reservation JSON before parsing", async () => {
  let idempotencyCalls = 0;
  let repositoryCalled = false;
  const handler = createStandaloneApiHandler({
    auth: { serviceApiKey: "platform-service-secret" },
    idempotencyRepository: {
      claimInProgress(record) {
        idempotencyCalls += 1;
        return new InMemoryIdempotencyRepository().claimInProgress(record);
      },
      storeCompleted() {
        idempotencyCalls += 1;
      },
    },
    reservationCreateRepository: reservationCreateRepository({
      async createReservationAtomic() {
        repositoryCalled = true;
        throw new Error("auth should block malformed JSON before repository work");
      },
    }),
  });

  await withStandaloneNodeServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/reservations`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Idempotency-Key": "idem_auth_malformed_json_123",
      },
      body: "{",
    });
    const body = await response.json();

    assert.equal(response.status, 401);
    assert.deepEqual(body, {
      error: {
        code: "unauthorized",
        message: "Missing bearer token.",
        status: 401,
      },
    });
    assert.equal(platformErrorResponseSchema.safeParse(body).success, true);
  }, handler);
  assert.equal(idempotencyCalls, 0);
  assert.equal(repositoryCalled, false);
});

test("standalone Node server rejects unauthenticated malformed optional-body mutations before parsing", async () => {
  let idempotencyCalls = 0;
  let repositoryCalled = false;
  const handler = createStandaloneApiHandler({
    auth: { serviceApiKey: "platform-service-secret" },
    idempotencyRepository: {
      claimInProgress(record) {
        idempotencyCalls += 1;
        return new InMemoryIdempotencyRepository().claimInProgress(record);
      },
      storeCompleted() {
        idempotencyCalls += 1;
      },
    },
    reservationMutationRepository: reservationMutationRepository({
      async updateReservation() {
        repositoryCalled = true;
        throw new Error("auth should block malformed JSON before reservation mutation work");
      },
    }),
    resourceMaintenanceRepository: resourceMaintenanceRepository({
      async endMaintenance() {
        repositoryCalled = true;
        throw new Error("auth should block malformed JSON before maintenance mutation work");
      },
    }),
  });

  await withStandaloneNodeServer(async (baseUrl) => {
    const routes = [
      `/v1/reservations/${validReservationId()}/cancel`,
      "/v1/resource-maintenance/maint_123/end",
    ];

    for (const path of routes) {
      const response = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": `idem_auth_malformed_optional_${path.replaceAll("/", "_")}`,
        },
        body: "{",
      });
      const body = await response.json();

      assert.equal(response.status, 401, path);
      assert.deepEqual(body, {
        error: {
          code: "unauthorized",
          message: "Missing bearer token.",
          status: 401,
        },
      }, path);
      assert.equal(platformErrorResponseSchema.safeParse(body).success, true, path);
    }
  }, handler);
  assert.equal(idempotencyCalls, 0);
  assert.equal(repositoryCalled, false);
});

test("standalone Node server does not mutate authenticated optional-body routes before malformed JSON rejection", async () => {
  let idempotencyCalls = 0;
  let repositoryCalled = false;
  const handler = createStandaloneApiHandler({
    auth: { serviceApiKey: "platform-service-secret" },
    idempotencyRepository: {
      claimInProgress(record) {
        idempotencyCalls += 1;
        return new InMemoryIdempotencyRepository().claimInProgress(record);
      },
      storeCompleted() {
        idempotencyCalls += 1;
      },
    },
    reservationMutationRepository: reservationMutationRepository({
      async updateReservation() {
        repositoryCalled = true;
        throw new Error("malformed JSON should block reservation mutation work");
      },
    }),
    resourceMaintenanceRepository: resourceMaintenanceRepository({
      async endMaintenance() {
        repositoryCalled = true;
        throw new Error("malformed JSON should block maintenance mutation work");
      },
    }),
  });

  await withStandaloneNodeServer(async (baseUrl) => {
    const routes = [
      `/v1/reservations/${validReservationId()}/cancel`,
      "/v1/resource-maintenance/maint_123/end",
    ];

    for (const path of routes) {
      const response = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: {
          Authorization: "Bearer platform-service-secret",
          "content-type": "application/json",
          "Idempotency-Key": `idem_auth_malformed_optional_${path.replaceAll("/", "_")}`,
        },
        body: "{",
      });
      const body = await response.json();

      assert.equal(response.status, 400, path);
      assert.deepEqual(body, {
        error: {
          code: "validation_failed",
          message: "Invalid JSON body.",
          status: 400,
        },
      }, path);
      assert.equal(platformErrorResponseSchema.safeParse(body).success, true, path);
    }
  }, handler);
  assert.equal(idempotencyCalls, 0);
  assert.equal(repositoryCalled, false);
});

test("standalone Node server preserves non-204 auth preflight failures before malformed JSON parsing", async () => {
  const handler = createStandaloneApiHandler({
    auth: {
      verifyBearerToken() {
        return {
          ok: false,
          status: 500,
          body: {
            error: {
              code: "internal_error",
              message: "Authentication verifier failed.",
              status: 500,
            },
          },
        };
      },
    },
    idempotencyRepository: {
      claimInProgress() {
        throw new Error("auth preflight failure should block idempotency");
      },
      storeCompleted() {
        throw new Error("auth preflight failure should block idempotency");
      },
    },
    reservationMutationRepository: reservationMutationRepository({
      async updateReservation() {
        throw new Error("auth preflight failure should block mutation work");
      },
    }),
  });

  await withStandaloneNodeServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/reservations/${validReservationId()}/cancel`, {
      method: "POST",
      headers: {
        Authorization: "Bearer failing-user-token",
        "content-type": "application/json",
        "Idempotency-Key": "idem_auth_preflight_failure_123",
      },
      body: "{",
    });
    const body = await response.json();

    assert.equal(response.status, 500);
    assert.deepEqual(body, {
      error: {
        code: "internal_error",
        message: "Authentication verifier failed.",
        status: 500,
      },
    });
    assert.equal(platformErrorResponseSchema.safeParse(body).success, true);
  }, handler);
});

test("standalone Node server requires idempotency before parsing malformed lifecycle JSON", async () => {
  await withStandaloneNodeServer(async (baseUrl) => {
    const routes = [
      { method: "PATCH", path: `/v1/reservations/${validReservationId()}` },
      { method: "POST", path: `/v1/reservations/${validReservationId()}/reschedule` },
      { method: "POST", path: `/v1/reservations/${validReservationId()}/cancel` },
    ];

    for (const route of routes) {
      const response = await fetch(`${baseUrl}${route.path}`, {
        method: route.method,
        headers: { "content-type": "application/json" },
        body: "{",
      });
      const body = await response.json();

      assert.equal(response.status, 400, route.path);
      assert.deepEqual(body, {
        error: {
          code: "missing_idempotency_key",
          message: "Missing Idempotency-Key header for mutation.",
          status: 400,
          idempotency: {
            status: "rejected",
          },
        },
      }, route.path);
      assert.equal(platformErrorResponseSchema.safeParse(body).success, true, route.path);
    }
  });
});

test("standalone Node server returns invalid JSON for lifecycle routes when idempotency key is present", async () => {
  await withStandaloneNodeServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/reservations/${validReservationId()}/cancel`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Idempotency-Key": "idem_lifecycle_malformed_json_123",
      },
      body: "{",
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.deepEqual(body, {
      error: {
        code: "validation_failed",
        message: "Invalid JSON body.",
        status: 400,
      },
    });
    assert.equal(platformErrorResponseSchema.safeParse(body).success, true);
  });
});

test("standalone Node server requires idempotency before parsing malformed resource maintenance JSON", async () => {
  await withStandaloneNodeServer(async (baseUrl) => {
    const routes = [
      "/v1/resource-maintenance",
      "/v1/resource-maintenance/maint_123/end",
    ];

    for (const path of routes) {
      const response = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      });
      const body = await response.json();

      assert.equal(response.status, 400, path);
      assert.deepEqual(body, {
        error: {
          code: "missing_idempotency_key",
          message: "Missing Idempotency-Key header for mutation.",
          status: 400,
          idempotency: {
            status: "rejected",
          },
        },
      }, path);
      assert.equal(platformErrorResponseSchema.safeParse(body).success, true, path);
    }
  });
});

test("standalone Node server returns invalid JSON for resource maintenance routes when idempotency key is present", async () => {
  await withStandaloneNodeServer(async (baseUrl) => {
    const routes = [
      "/v1/resource-maintenance",
      "/v1/resource-maintenance/maint_123/end",
    ];

    for (const path of routes) {
      const response = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": "idem_maintenance_malformed_json_123",
        },
        body: "{",
      });
      const body = await response.json();

      assert.equal(response.status, 400, path);
      assert.deepEqual(body, {
        error: {
          code: "validation_failed",
          message: "Invalid JSON body.",
          status: 400,
        },
      }, path);
      assert.equal(platformErrorResponseSchema.safeParse(body).success, true, path);
    }
  });
});

test("reservation create route validates body before repository configuration or mutation work", async () => {
  const response = await handleStandaloneApiRequest({
    method: "POST",
    path: "/v1/reservations",
    headers: { "Idempotency-Key": "idem_invalid_body_123" },
    body: { service_id: "svc_123" },
  });

  assert.equal(response.status, 400);
  assert.equal((response.body as { error: { code: string } }).error.code, "validation_failed");
  assert.equal((response.body as { error: { message: string } }).error.message, "Invalid reservation data.");
  assert.equal(platformErrorResponseSchema.safeParse(response.body).success, true);
});

test("reservation create route uses injected repositories and commits successful responses", async () => {
  let repositoryCall: unknown;
  const idempotencyRepository = new InMemoryIdempotencyRepository();
  const handler = createStandaloneApiHandler({
    idempotencyRepository,
    reservationCreateRepository: reservationCreateRepository({
      async createReservationAtomic(input) {
        repositoryCall = input;
        return {
          ok: true,
          atomic: true,
          reservation: input.reservation,
          booking: reservationRow(),
          validation: { ok: true },
        };
      },
    }),
  });

  const response = await handler({
    method: "POST",
    path: "/v1/reservations",
    headers: {
      "Idempotency-Key": "idem_create_success_123",
      "X-Reservation-Tenant-Id": "tenant_1",
    },
    body: validCreateReservationBody(),
  });

  assert.equal(response.status, 201);
  assert.equal(reservationResponseSchema.safeParse(response.body).success, true);
  assert.deepEqual(response.body, reservationBody());
  assert.deepEqual(repositoryCall, {
    reservation: {
      service_id: "11111111-1111-4111-8111-222222222222",
      customer_name: "Alice Example",
      customer_email: "alice@example.com",
      customer_phone: "+60123456789",
      booking_date: "2026-07-01",
      start_time: "10:00",
      end_time: "11:00",
      quantity: 2,
      items: [
        { resource_label: "A1", quantity: 1 },
        { resource_label: "B1", quantity: 1 },
      ],
      status: "confirmed",
      interface_type: "form",
      seats_booked: 2,
      seat_labels: ["A1", "B1"],
    },
  });
  assert.equal(idempotencyRepository.records.get("idem_create_success_123")?.status, "completed");
  assert.equal(idempotencyRepository.records.get("idem_create_success_123")?.tenantId, "tenant_1");
});

test("reservation create route replays completed idempotent responses without a second mutation", async () => {
  let createCalls = 0;
  const handler = createStandaloneApiHandler({
    idempotencyRepository: new InMemoryIdempotencyRepository(),
    reservationCreateRepository: reservationCreateRepository({
      async createReservationAtomic(input) {
        createCalls += 1;
        return {
          ok: true,
          atomic: true,
          reservation: input.reservation,
          booking: reservationRow(),
          validation: { ok: true },
        };
      },
    }),
  });
  const request = {
    method: "POST",
    path: "/v1/reservations",
    headers: { "Idempotency-Key": "idem_replay_123" },
    body: validCreateReservationBody(),
  };

  const first = await handler(request);
  const second = await handler(request);

  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.deepEqual(second.body, first.body);
  assert.equal(createCalls, 1);
});

test("reservation create route rejects idempotency key reuse with a different request", async () => {
  let createCalls = 0;
  const handler = createStandaloneApiHandler({
    idempotencyRepository: new InMemoryIdempotencyRepository(),
    reservationCreateRepository: reservationCreateRepository({
      async createReservationAtomic(input) {
        createCalls += 1;
        return {
          ok: true,
          atomic: true,
          reservation: input.reservation,
          booking: reservationRow(),
          validation: { ok: true },
        };
      },
    }),
  });

  const first = await handler({
    method: "POST",
    path: "/v1/reservations",
    headers: { "Idempotency-Key": "idem_misuse_123" },
    body: validCreateReservationBody(),
  });
  const second = await handler({
    method: "POST",
    path: "/v1/reservations",
    headers: { "Idempotency-Key": "idem_misuse_123" },
    body: validCreateReservationBody({
      quantity: 1,
      reservation_items: [{ resource_label: "A1", quantity: 1 }],
    }),
  });

  assert.equal(first.status, 201);
  assert.equal(second.status, 409);
  assert.deepEqual(second.body, {
    error: {
      code: "idempotency_key_reused_with_different_request",
      message: "Idempotency key was already used for a different mutation request.",
      status: 409,
      idempotency: {
        key: "idem_misuse_123",
        status: "rejected",
      },
    },
  });
  assert.equal(createCalls, 1);
});

test("reservation create route returns stable platform errors when mutation dependencies are missing", async () => {
  const noCreateRepository = await createStandaloneApiHandler({
    idempotencyRepository: new InMemoryIdempotencyRepository(),
  })({
    method: "POST",
    path: "/v1/reservations",
    headers: { "Idempotency-Key": "idem_missing_create_123" },
    body: validCreateReservationBody(),
  });
  const noCreateOrIdempotencyRepository = await handleStandaloneApiRequest({
    method: "POST",
    path: "/v1/reservations",
    headers: { "Idempotency-Key": "idem_missing_create_and_idem_123" },
    body: validCreateReservationBody(),
  });
  const noIdempotencyRepository = await createStandaloneApiHandler({
    reservationCreateRepository: reservationCreateRepository(),
  })({
    method: "POST",
    path: "/v1/reservations",
    headers: { "Idempotency-Key": "idem_missing_idem_123" },
    body: validCreateReservationBody(),
  });

  assert.equal(noCreateRepository.status, 503);
  assert.deepEqual(noCreateRepository.body, {
    error: {
      code: "bad_request",
      message: "Reservation create repository is not configured.",
      status: 503,
    },
  });
  assert.equal(noCreateOrIdempotencyRepository.status, 503);
  assert.deepEqual(noCreateOrIdempotencyRepository.body, {
    error: {
      code: "bad_request",
      message: "Idempotency repository is not configured.",
      status: 503,
    },
  });
  assert.equal(noIdempotencyRepository.status, 503);
  assert.deepEqual(noIdempotencyRepository.body, {
    error: {
      code: "bad_request",
      message: "Idempotency repository is not configured.",
      status: 503,
    },
  });
});

test("reservation update route uses injected repositories and commits successful responses", async () => {
  let repositoryCall: unknown;
  const idempotencyRepository = new InMemoryIdempotencyRepository();
  const handler = createStandaloneApiHandler({
    idempotencyRepository,
    reservationMutationRepository: reservationMutationRepository({
      async updateReservation(input) {
        repositoryCall = input;
        return {
          data: reservationRow({
            id: input.reservationId,
            user_name: input.patch.user_name,
            user_email: input.patch.user_email,
            status: input.patch.status,
            updated_at: input.patch.updated_at,
          }),
        };
      },
    }),
  });

  const response = await handler({
    method: "PATCH",
    path: `/v1/reservations/${validReservationId()}`,
    headers: {
      "Idempotency-Key": "idem_update_success_123",
      "X-Reservation-Tenant-Id": "tenant_1",
    },
    body: {
      customer: {
        name: "Ada Lovelace",
        email: "ada@example.com",
      },
      status: "completed",
    },
  });

  assert.equal(response.status, 200);
  assert.equal(reservationResponseSchema.safeParse(response.body).success, true);
  assert.deepEqual(response.body, reservationBody({
    customer: {
      customer_id: undefined,
      external_customer_id: undefined,
      name: "Ada Lovelace",
      email: "ada@example.com",
      phone: "+60123456789",
    },
    status: "completed",
    updated_at: (repositoryCall as { patch: { updated_at: string } }).patch.updated_at,
  }));
  assert.deepEqual(repositoryCall, {
    reservationId: validReservationId(),
    patch: {
      user_name: "Ada Lovelace",
      user_email: "ada@example.com",
      status: "completed",
      updated_at: (repositoryCall as { patch: { updated_at: string } }).patch.updated_at,
    },
  });
  assert.equal(idempotencyRepository.records.get("idem_update_success_123")?.status, "completed");
  assert.equal(idempotencyRepository.records.get("idem_update_success_123")?.tenantId, "tenant_1");
});

test("reservation reschedule route uses injected repositories and platform response mapping", async () => {
  let repositoryCall: unknown;
  const handler = createStandaloneApiHandler({
    idempotencyRepository: new InMemoryIdempotencyRepository(),
    reservationMutationRepository: reservationMutationRepository({
      async updateReservation(input) {
        repositoryCall = input;
        return {
          data: reservationRow({
            id: input.reservationId,
            booking_date: input.patch.booking_date,
            start_time: input.patch.start_time,
            end_time: input.patch.end_time,
            seats_booked: input.patch.seats_booked,
            seat_labels: input.patch.seat_labels,
            updated_at: input.patch.updated_at,
          }),
        };
      },
    }),
  });

  const response = await handler({
    method: "POST",
    path: `/v1/reservations/${validReservationId()}/reschedule`,
    headers: { "Idempotency-Key": "idem_reschedule_success_123" },
    body: {
      date: "2026-07-02",
      start_time: "15:00",
      end_time: "16:00",
      quantity: 1,
      resource_ids: ["A1"],
    },
  });

  assert.equal(response.status, 200);
  assert.equal(reservationResponseSchema.safeParse(response.body).success, true);
  assert.deepEqual(response.body, reservationBody({
    date: "2026-07-02",
    start_time: "15:00",
    end_time: "16:00",
    quantity: 1,
    reservation_items: [{ resource_label: "A1", quantity: 1 }],
    updated_at: (repositoryCall as { patch: { updated_at: string } }).patch.updated_at,
  }));
  assert.deepEqual(repositoryCall, {
    reservationId: validReservationId(),
    patch: {
      booking_date: "2026-07-02",
      start_time: "15:00",
      end_time: "16:00",
      seats_booked: 1,
      seat_labels: ["A1"],
      updated_at: (repositoryCall as { patch: { updated_at: string } }).patch.updated_at,
    },
  });
});

test("reservation cancel route validates input but uses the existing cancel service patch shape", async () => {
  let repositoryCall: unknown;
  const handler = createStandaloneApiHandler({
    idempotencyRepository: new InMemoryIdempotencyRepository(),
    reservationMutationRepository: reservationMutationRepository({
      async updateReservation(input) {
        repositoryCall = input;
        return {
          data: reservationRow({
            id: input.reservationId,
            status: input.patch.status,
            updated_at: input.patch.updated_at,
          }),
        };
      },
    }),
  });

  const response = await handler({
    method: "POST",
    path: `/v1/reservations/${validReservationId()}/cancel`,
    headers: { "Idempotency-Key": "idem_cancel_success_123" },
    body: {
      reason: "customer_request",
      metadata: {
        source: "standalone-api-test",
      },
    },
  });

  assert.equal(response.status, 200);
  assert.equal(reservationResponseSchema.safeParse(response.body).success, true);
  assert.equal((response.body as { status: string }).status, "cancelled");
  assert.deepEqual(repositoryCall, {
    reservationId: validReservationId(),
    patch: {
      status: "cancelled",
      updated_at: (repositoryCall as { patch: { updated_at: string } }).patch.updated_at,
    },
  });
});

test("reservation lifecycle routes require idempotency before id, body, or repository work", async () => {
  let repositoryCalled = false;
  const handler = createStandaloneApiHandler({
    idempotencyRepository: new InMemoryIdempotencyRepository(),
    reservationMutationRepository: reservationMutationRepository({
      async updateReservation() {
        repositoryCalled = true;
        throw new Error("should not mutate without idempotency key");
      },
    }),
  });

  const response = await handler({
    method: "PATCH",
    path: "/v1/reservations/not-a-uuid",
    body: null,
  });

  assert.equal(repositoryCalled, false);
  assert.equal(response.status, 400);
  assert.deepEqual(response.body, {
    error: {
      code: "missing_idempotency_key",
      message: "Missing Idempotency-Key header for mutation.",
      status: 400,
      idempotency: {
        status: "rejected",
      },
    },
  });
});

test("reservation lifecycle routes validate ids and bodies before repository configuration", async () => {
  const invalidId = await handleStandaloneApiRequest({
    method: "PATCH",
    path: "/v1/reservations/not-a-uuid",
    headers: { "Idempotency-Key": "idem_lifecycle_invalid_id_123" },
    body: {
      customer: {
        name: "Ada Lovelace",
      },
    },
  });
  const invalidBody = await handleStandaloneApiRequest({
    method: "PATCH",
    path: `/v1/reservations/${validReservationId()}`,
    headers: { "Idempotency-Key": "idem_lifecycle_invalid_body_123" },
    body: {
      metadata: {
        note: "unsupported in the compatibility shim",
      },
    },
  });

  assert.equal(invalidId.status, 400);
  assert.equal((invalidId.body as { error: { code: string } }).error.code, "validation_failed");
  assert.equal((invalidId.body as { error: { message: string } }).error.message, "Invalid booking update data");
  assert.equal(invalidBody.status, 400);
  assert.deepEqual(invalidBody.body, {
    error: {
      code: "validation_failed",
      message: "Reservation PATCH field metadata is not supported by the current compatibility shim.",
      status: 400,
    },
  });
});

test("reservation lifecycle routes return stable platform errors when mutation dependencies are missing", async () => {
  let repositoryCalled = false;
  const noMutationRepository = await createStandaloneApiHandler({
    idempotencyRepository: new InMemoryIdempotencyRepository(),
  })({
    method: "POST",
    path: `/v1/reservations/${validReservationId()}/cancel`,
    headers: { "Idempotency-Key": "idem_missing_mutation_123" },
    body: {},
  });
  const noMutationOrIdempotencyRepository = await handleStandaloneApiRequest({
    method: "POST",
    path: `/v1/reservations/${validReservationId()}/cancel`,
    headers: { "Idempotency-Key": "idem_missing_mutation_and_idem_123" },
    body: {},
  });
  const noIdempotencyRepository = await createStandaloneApiHandler({
    reservationMutationRepository: reservationMutationRepository({
      async updateReservation() {
        repositoryCalled = true;
        throw new Error("should not mutate without idempotency storage");
      },
    }),
  })({
    method: "POST",
    path: `/v1/reservations/${validReservationId()}/cancel`,
    headers: { "Idempotency-Key": "idem_missing_lifecycle_idem_123" },
    body: {},
  });

  assert.equal(noMutationRepository.status, 503);
  assert.deepEqual(noMutationRepository.body, {
    error: {
      code: "bad_request",
      message: "Reservation mutation repository is not configured.",
      status: 503,
    },
  });
  assert.equal(noMutationOrIdempotencyRepository.status, 503);
  assert.deepEqual(noMutationOrIdempotencyRepository.body, {
    error: {
      code: "bad_request",
      message: "Idempotency repository is not configured.",
      status: 503,
    },
  });
  assert.equal(noIdempotencyRepository.status, 503);
  assert.deepEqual(noIdempotencyRepository.body, {
    error: {
      code: "bad_request",
      message: "Idempotency repository is not configured.",
      status: 503,
    },
  });
  assert.equal(repositoryCalled, false);
});

test("reservation lifecycle routes replay completed idempotent responses without a second mutation", async () => {
  let mutationCalls = 0;
  const handler = createStandaloneApiHandler({
    idempotencyRepository: new InMemoryIdempotencyRepository(),
    reservationMutationRepository: reservationMutationRepository({
      async updateReservation(input) {
        mutationCalls += 1;
        return {
          data: reservationRow({
            id: input.reservationId,
            user_name: input.patch.user_name,
          }),
        };
      },
    }),
  });
  const request = {
    method: "PATCH",
    path: `/v1/reservations/${validReservationId()}`,
    headers: { "Idempotency-Key": "idem_lifecycle_replay_123" },
    body: {
      customer: {
        name: "Ada Lovelace",
      },
    },
  };

  const first = await handler(request);
  const second = await handler(request);

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.deepEqual(second.body, first.body);
  assert.equal(mutationCalls, 1);
});

test("reservation lifecycle routes reject idempotency key reuse with a different request", async () => {
  let mutationCalls = 0;
  const handler = createStandaloneApiHandler({
    idempotencyRepository: new InMemoryIdempotencyRepository(),
    reservationMutationRepository: reservationMutationRepository({
      async updateReservation(input) {
        mutationCalls += 1;
        return {
          data: reservationRow({
            id: input.reservationId,
            user_name: input.patch.user_name,
          }),
        };
      },
    }),
  });

  const first = await handler({
    method: "PATCH",
    path: `/v1/reservations/${validReservationId()}`,
    headers: { "Idempotency-Key": "idem_lifecycle_misuse_123" },
    body: {
      customer: {
        name: "Ada Lovelace",
      },
    },
  });
  const second = await handler({
    method: "PATCH",
    path: `/v1/reservations/${validReservationId()}`,
    headers: { "Idempotency-Key": "idem_lifecycle_misuse_123" },
    body: {
      customer: {
        name: "Grace Hopper",
      },
    },
  });

  assert.equal(first.status, 200);
  assert.equal(second.status, 409);
  assert.deepEqual(second.body, {
    error: {
      code: "idempotency_key_reused_with_different_request",
      message: "Idempotency key was already used for a different mutation request.",
      status: 409,
      idempotency: {
        key: "idem_lifecycle_misuse_123",
        status: "rejected",
      },
    },
  });
  assert.equal(mutationCalls, 1);
});

test("standalone app source stays outside frontend and provider boundaries", () => {
  const source = readSourceTree(fileURLToPath(new URL("..", import.meta.url)));
  const forbiddenPatterns = [
    { name: "Next.js", pattern: /\bfrom\s+["']next(?:\/|["'])|\bimport\s+["']next(?:\/|["'])/ },
    { name: "React", pattern: /\bfrom\s+["']react(?:\/|["'])|\bimport\s+["']react(?:\/|["'])/ },
    { name: "frontend app imports", pattern: /\bfrom\s+["'](?:@\/)?app\// },
    { name: "component imports", pattern: /\bfrom\s+["'](?:@\/)?components\// },
    { name: "frontend lib wrappers", pattern: /\bfrom\s+["'](?:@\/)?lib\// },
    { name: "browser Supabase helper", pattern: /@supabase\/ssr|createBrowserClient|lib\/supabase(?:["']|\/)/ },
    { name: "LangChain", pattern: /@langchain\/|langchain/ },
    { name: "AI provider SDKs", pattern: /@ai-sdk\/|@google\/generative-ai|openai/ },
  ];

  for (const forbidden of forbiddenPatterns) {
    assert.equal(forbidden.pattern.test(source), false, forbidden.name);
  }
});

function userPrincipal(overrides: Partial<AuthenticatedPlatformPrincipal> = {}): AuthenticatedPlatformPrincipal {
  return {
    subjectId: "user_1",
    tenantIds: ["tenant_1"],
    roles: ["user"],
    scopes: ["reservations:read"],
    ...overrides,
  };
}

function rejectedAuthResult(_providerDetail?: string): {
  ok: false;
  status: number;
  body: PlatformErrorResponse;
} {
  return {
    ok: false,
    status: 401,
    body: rejectedAuthBody(),
  };
}

function rejectedAuthBody(): PlatformErrorResponse {
  return {
    error: {
      code: "unauthorized",
      message: "Invalid bearer token.",
      status: 401,
    },
  };
}

function readSourceTree(directory: string): string {
  const chunks: string[] = [];

  for (const entry of readdirSync(directory)) {
    if (entry === "node_modules" || entry === "dist") {
      continue;
    }
    const path = join(directory, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      chunks.push(readSourceTree(path));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
      chunks.push(readFileSync(path, "utf8"));
    }
  }

  return chunks.join("\n");
}

async function withStandaloneNodeServer<T>(
  run: (baseUrl: string) => Promise<T>,
  handler?: StandaloneApiHandler,
): Promise<T> {
  const server = createStandaloneNodeServer(handler);

  try {
    server.listen(0, "127.0.0.1");
    await once(server, "listening");

    const address = server.address() as AddressInfo | null;
    if (!address) {
      throw new Error("Standalone Node server did not expose a listen address.");
    }

    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await closeServer(server);
  }
}

function rawHttpRequest(
  url: string,
  options: {
    method: string;
    headers?: Record<string, string>;
    body?: string;
  },
): Promise<{
  statusCode: number | undefined;
  headers: IncomingHttpHeaders;
  body: string;
}> {
  const target = new URL(url);

  return new Promise((resolve, reject) => {
    const request = httpRequest({
      hostname: target.hostname,
      port: target.port,
      path: `${target.pathname}${target.search}`,
      method: options.method,
      headers: options.headers,
    }, (response) => {
      const chunks: Buffer[] = [];

      response.on("data", (chunk: Buffer | string) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      response.on("end", () => {
        resolve({
          statusCode: response.statusCode,
          headers: response.headers,
          body: Buffer.concat(chunks).toString("utf8"),
        });
      });
    });

    request.on("error", reject);
    if (options.body !== undefined) {
      request.write(options.body);
    }
    request.end();
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

function catalogRepository(overrides: Partial<PlatformCatalogRepository> = {}): PlatformCatalogRepository {
  return {
    async listVenues() {
      return {
        data: [{
          id: "venue_1",
          tenant_id: "tenant_1",
          name: "Main venue",
          timezone: "Asia/Kuala_Lumpur",
        }],
      };
    },
    async getVenue(id) {
      return {
        data: {
          id,
          tenant_id: "tenant_1",
          name: "Main venue",
          timezone: "Asia/Kuala_Lumpur",
        },
      };
    },
    async listServices() {
      return {
        data: [{
          id: "service_1",
          venue_id: "venue_1",
          name: "Simulator",
          resource_strategy: "assigned_resource",
        }],
      };
    },
    async getService(id) {
      return {
        data: {
          id,
          venue_id: "venue_1",
          name: "Simulator",
          resource_strategy: "assigned_resource",
        },
      };
    },
    async listResources() {
      return {
        data: [{
          id: "resource_1",
          service_id: "service_1",
          label: "Rig 1",
          kind: "station",
          is_active: true,
          capacity: 1,
        }],
      };
    },
    async getResource(id) {
      return {
        data: {
          id,
          service_id: "service_1",
          label: "Rig 1",
          kind: "station",
          is_active: true,
          capacity: 1,
        },
      };
    },
    async getResourceLayout(id) {
      return {
        data: {
          id,
          service_id: "service_1",
          kind: "grid",
          columns: 2,
          rows: 1,
        },
      };
    },
    ...overrides,
  };
}

function availabilityRepository(overrides: Partial<AvailabilityRepositoryPort> = {}): AvailabilityRepositoryPort {
  return {
    async readAvailability() {
      return {
        service: availabilityService(),
        bookings: [],
        maintenanceResourceLabels: [],
      };
    },
    ...overrides,
  };
}

function tenantVenueRepository(overrides: Partial<PlatformTenantVenueRepository> = {}): PlatformTenantVenueRepository {
  return {
    async getTenant(id) {
      return { data: { id } };
    },
    async getVenue(id) {
      return { data: { id, tenant_id: "tenant_1" } };
    },
    ...overrides,
  };
}

function availabilityService(): ReservationService {
  return {
    id: "svc_123",
    name: "Court 1",
    total_seats: 2,
    resource_kind: "seat",
    selection_mode: "assigned_resource",
    policy: createAssignedResourcePolicy(2),
    resources: [
      {
        id: "res_a",
        service_id: "svc_123",
        label: "A1",
        kind: "seat",
        is_active: true,
        capacity: 1,
      },
      {
        id: "res_b",
        service_id: "svc_123",
        label: "B1",
        kind: "seat",
        is_active: true,
        capacity: 1,
      },
    ],
    layout: {
      kind: "grid",
      columns: 2,
      rows: 1,
    },
  };
}

function reservationReadRepository(overrides: Partial<ReservationReadRepositoryPort> = {}): ReservationReadRepositoryPort {
  return {
    async listReservations() {
      return { data: [reservationRow()] };
    },
    async readReservationById(reservationId) {
      return { data: reservationRow({ id: reservationId }) };
    },
    ...overrides,
  };
}

function reservationCreateRepository(overrides: Partial<ReservationCreateRepositoryPort> = {}): ReservationCreateRepositoryPort {
  return {
    async createReservationAtomic(input) {
      return {
        ok: true,
        atomic: true,
        reservation: input.reservation,
        booking: reservationRow(),
        validation: { ok: true },
      };
    },
    ...overrides,
  };
}

function reservationMutationRepository(overrides: Partial<ReservationMutationRepositoryPort> = {}): ReservationMutationRepositoryPort {
  return {
    async updateReservation(input) {
      return {
        data: reservationRow({
          id: input.reservationId,
          ...input.patch,
        }),
      };
    },
    ...overrides,
  };
}

function resourceMaintenanceRepository(
  overrides: Partial<ResourceMaintenanceRepositoryPort> = {},
): ResourceMaintenanceRepositoryPort {
  return {
    async listActiveMaintenance() {
      return { data: [resourceMaintenanceRow()] };
    },
    async resolveResource(input) {
      return {
        serviceId: input.service_id,
        label: typeof input.metadata?.resource_label === "string"
          ? input.metadata.resource_label
          : input.resource_id,
      };
    },
    async loadService() {
      return {
        data: {
          selection_mode: "assigned_resource",
          resources: [{ label: "A1", is_active: true }],
        },
      };
    },
    async createMaintenance(row) {
      return { data: resourceMaintenanceRow({ ...row }) };
    },
    async endMaintenance(id, input) {
      return {
        data: resourceMaintenanceRow({
          id,
          ends_at: "2026-07-02T00:00:00.000Z",
          reason: input?.reason,
        }),
      };
    },
    ...overrides,
  };
}

class InMemoryIdempotencyRepository implements IdempotencyRepository {
  readonly records = new Map<string, IdempotencyRecord>();

  claimInProgress(record: IdempotencyRecord) {
    const existing = this.records.get(record.key);
    if (existing) {
      return existing;
    }

    this.records.set(record.key, record);
    return null;
  }

  storeCompleted(record: IdempotencyCommitRecord) {
    this.records.set(record.key, record);
  }
}

function validCreateReservationBody(overrides: Record<string, unknown> = {}) {
  return {
    tenant_id: "tenant_1",
    venue_id: "venue_1",
    service_id: "11111111-1111-4111-8111-222222222222",
    date: "2026-07-01",
    start_time: "10:00",
    end_time: "11:00",
    quantity: 2,
    reservation_items: [
      { resource_label: "A1", quantity: 1 },
      { resource_label: "B1", quantity: 1 },
    ],
    customer: {
      name: "Alice Example",
      email: "alice@example.com",
      phone: "+60123456789",
    },
    ...overrides,
  };
}

function validReservationId() {
  return "11111111-1111-4111-8111-111111111111";
}

function reservationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: validReservationId(),
    tenant_id: "tenant_1",
    venue_id: "venue_1",
    service_id: "svc_123",
    booking_date: "2026-07-01",
    start_time: "10:00",
    end_time: "11:00",
    seats_booked: 2,
    seat_labels: ["A1", "B1"],
    user_name: "Alice Example",
    user_email: "alice@example.com",
    user_phone: "+60123456789",
    status: "confirmed",
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

function resourceMaintenanceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "maint_1",
    service_id: "svc_123",
    seat_label: "A1",
    starts_at: "2026-07-01T00:00:00.000Z",
    ends_at: undefined,
    reason: "Maintenance",
    metadata: undefined,
    ...overrides,
  };
}

function reservationBody(overrides: Record<string, unknown> = {}) {
  return {
    reservation_id: "11111111-1111-4111-8111-111111111111",
    status: "confirmed",
    tenant_id: "tenant_1",
    venue_id: "venue_1",
    service_id: "svc_123",
    date: "2026-07-01",
    start_time: "10:00",
    end_time: "11:00",
    quantity: 2,
    reservation_items: [
      { resource_label: "A1", quantity: 1 },
      { resource_label: "B1", quantity: 1 },
    ],
    customer: {
      customer_id: undefined,
      external_customer_id: undefined,
      name: "Alice Example",
      email: "alice@example.com",
      phone: "+60123456789",
    },
    metadata: undefined,
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

function resourceMaintenanceBody(overrides: Record<string, unknown> = {}) {
  return {
    maintenance_id: "maint_1",
    resource_id: undefined,
    service_id: "svc_123",
    starts_at: "2026-07-01T00:00:00.000Z",
    ends_at: undefined,
    reason: "Maintenance",
    metadata: { resource_label: "A1" },
    ...overrides,
  };
}
