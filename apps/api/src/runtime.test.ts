import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import { createCapacityPolicy } from "@project-play/reservations-core";
import {
  InMemoryConversationBookingStateStore,
  type AvailabilityRepositoryPort,
  type ConversationOrchestratorDependencies,
  type ConversationRepository,
  type PlatformCatalogRepository,
  type ReservationCreateRepositoryPort,
} from "@reservation-platform/api";

import { createStandaloneApiHandler } from "./routes.js";
import type { StandaloneApiDependencies } from "./routes.js";
import {
  createStandaloneSupabaseDependencies,
  createStandaloneSupabaseDependenciesFromEnv,
  createConversationBookingTools,
  StandaloneSupabaseConfigError,
  standaloneWhatsAppDependenciesFromEnv,
  type StandaloneSupabaseClient,
  type StandaloneSupabaseClientFactory,
  type StandaloneSupabasePublicAdminClients,
  type StandaloneSupabaseRepositoryFactories,
} from "./runtime.js";

test("public chat booking tools keep the published venue through validation, availability, and creation", async () => {
  const serviceId = "123e4567-e89b-42d3-a456-426614174000";
  const catalogScopes: unknown[] = [];
  let availabilityInput: unknown;
  let createInput: unknown;
  const catalogRepository: PlatformCatalogRepository = {
    async listVenues() { return { data: [] }; },
    async getVenue() { return { data: null }; },
    async listServices(input) {
      catalogScopes.push(input);
      return { data: [{
        id: serviceId,
        name: "Consultation",
        total_seats: 1,
        resource_kind: "seat",
        selection_mode: "capacity",
      }] };
    },
    async getService() { throw new Error("public chat must not read a raw service id"); },
    async listResources() { return { data: [] }; },
    async getResource() { return { data: null }; },
    async getResourceLayout() { return { data: null }; },
  };
  const availabilityRepository: AvailabilityRepositoryPort = {
    async readAvailability(input) {
      availabilityInput = input;
      return {
        service: {
          id: serviceId,
          name: "Consultation",
          description: "",
          total_seats: 1,
          resource_kind: "seat",
          selection_mode: "quantity",
          policy: createCapacityPolicy(1),
          resources: [],
          layout: { kind: "none", resources: [] },
        },
        bookings: [],
        maintenanceResourceLabels: [],
      };
    },
  };
  const reservationCreateRepository: ReservationCreateRepositoryPort = {
    async createReservationAtomic(input) {
      createInput = input;
      return {
        ok: true,
        atomic: true,
        booking: {
          id: "reservation-a",
          service_id: input.reservation.service_id,
          user_name: input.reservation.customer_name,
          user_email: input.reservation.customer_email,
          user_phone: input.reservation.customer_phone,
          booking_date: input.reservation.booking_date,
          start_time: input.reservation.start_time,
          end_time: input.reservation.end_time,
          seats_booked: input.reservation.seats_booked,
          seat_labels: [],
          status: "confirmed",
          interface_type: "chat",
        },
        reservation: input.reservation,
        validation: { ok: true },
      };
    },
  };
  const tools = createConversationBookingTools({
    catalogRepository,
    availabilityRepository,
    reservationCreateRepository,
  });
  const scope = { tenantId: "tenant-a", venueId: "venue-a" };

  assert.equal(await tools.getService(scope, "service-other-venue"), undefined);
  await assert.rejects(
    () => tools.checkAvailability(scope, { serviceId: "service-other-venue", date: "2026-07-20" }),
    /outside the published experience/i,
  );
  const availability = await tools.checkAvailability(scope, { serviceId, date: "2026-07-20" });
  assert.ok(availability.slots.length > 0);
  await tools.createReservation(scope, {
    service_id: serviceId,
    date: "2026-07-20",
    start_time: "09:00",
    end_time: "10:00",
    quantity: 1,
    customer: { name: "Ada", email: "ada@example.com", phone: "555" },
    source: "web_chat",
  }, "proposal-a");

  assert.deepEqual(catalogScopes, [
    { venueId: "venue-a" },
    { venueId: "venue-a" },
    { venueId: "venue-a" },
  ]);
  assert.deepEqual(availabilityInput, {
    serviceId,
    date: "2026-07-20",
    venueId: "venue-a",
  });
  assert.equal((createInput as { venueId?: string }).venueId, "venue-a");
});

test("standalone Supabase env factory returns default dependencies when config is absent", () => {
  const dependencies = createStandaloneSupabaseDependenciesFromEnv({}, {
    createClient() {
      throw new Error("createClient should not be called without runtime config");
    },
  });

  assert.deepEqual(dependencies, {});
});

test("standalone Supabase env factory reads backend service auth without Supabase config", () => {
  const dependencies = createStandaloneSupabaseDependenciesFromEnv({
    RESERVATION_PLATFORM_SERVICE_API_KEY: " platform-service-secret ",
  }, {
    createClient() {
      throw new Error("createClient should not be called for service auth only");
    },
  });

  assert.deepEqual(dependencies, {
    auth: {
      serviceApiKey: "platform-service-secret",
    },
  });
});

test("standalone Supabase env factory fails closed for WhatsApp without database storage", () => {
  assert.throws(
    () => createStandaloneSupabaseDependenciesFromEnv({
      RESERVATION_WHATSAPP_ENABLED: "true",
      RESERVATION_WHATSAPP_PROVIDER: "session_qr",
    }, {
      createClient() {
        throw new Error("createClient should not be called for missing WhatsApp database config");
      },
    }),
    (error) => {
      assert.equal(error instanceof StandaloneSupabaseConfigError, true);
      assert.deepEqual(
        (error as StandaloneSupabaseConfigError).missingConfigKeys,
        [
          "RESERVATION_SUPABASE_URL",
          "RESERVATION_SUPABASE_ANON_KEY",
          "RESERVATION_SUPABASE_SERVICE_ROLE_KEY",
        ],
      );
      return true;
    },
  );
});

test("standalone Supabase env factory wires WhatsApp memory store only with explicit dev opt-in", async () => {
  const dependencies = createStandaloneSupabaseDependenciesFromEnv({
    RESERVATION_WHATSAPP_ENABLED: "true",
    RESERVATION_WHATSAPP_PROVIDER: "session_qr",
    RESERVATION_WHATSAPP_ALLOW_MEMORY_STORE: "true",
    RESERVATION_WHATSAPP_SIMULATION_ENABLED: "true",
  }, {
    createClient() {
      throw new Error("createClient should not be called for WhatsApp session mode only");
    },
  });

  assert.equal(typeof dependencies.whatsappModule?.startSession, "function");
  const status = await dependencies.whatsappModule?.sessionStatus();
  const config = await dependencies.whatsappModule?.getConfig();
  const readiness = await dependencies.whatsappModule?.readiness() as {
    production_ready?: boolean;
    simulation_enabled?: boolean;
    missing_requirements?: string[];
  };

  assert.equal(status?.provider, "session_qr");
  assert.equal(status?.status, "disconnected");
  assert.equal(config?.business_name, "Reservation Business");
  assert.equal(readiness.production_ready, false);
  assert.equal(readiness.simulation_enabled, true);
  assert.deepEqual(readiness.missing_requirements, [
    "database",
    "ai_provider",
    "reservation_tools",
    "default_service_id",
    "whatsapp_connected",
  ]);
});

test("WhatsApp runtime bridge routes scoped inbound messages through unified conversations", async () => {
  const observed: unknown[] = [];
  const conversation = {
    conversation_id: "conversation_1", tenant_id: "tenant_1", venue_id: "venue_1", channel: "whatsapp" as const,
    status: "active" as const, automation_state: "automated" as const, created_at: "now", updated_at: "now",
  };
  const conversations: ConversationRepository = {
    list: async () => ({ data: [conversation] }),
    get: async () => ({ data: conversation }),
    getOrCreate: async (scope, input) => { observed.push({ scope, input }); return { data: conversation }; },
    listMessages: async () => ({ data: [] }),
    append: async (_scope, id, input) => ({ data: {
      message_id: `message_${input.direction}`, conversation_id: id, channel: input.channel, direction: input.direction,
      sender_type: input.senderType, delivery_state: input.deliveryState ?? "sent", content: input.content, created_at: "now",
    } }),
    updateAutomation: async () => ({ data: conversation }),
  };
  const orchestrator: ConversationOrchestratorDependencies = {
    conversations,
    state: new InMemoryConversationBookingStateStore(),
    responder: { respond: async () => ({ content: "Unified WhatsApp reply", supported: true }) },
    tools: { getService: async () => undefined, checkAvailability: async () => ({ slots: [] }), createReservation: async () => { throw new Error("not called"); } },
    loadExperience: async () => ({ businessName: "Apex", knowledge: [], services: [] }),
  };
  const dependencies = standaloneWhatsAppDependenciesFromEnv({
    RESERVATION_WHATSAPP_ENABLED: "true",
    RESERVATION_WHATSAPP_PROVIDER: "meta_cloud",
    RESERVATION_WHATSAPP_ALLOW_MEMORY_STORE: "true",
    RESERVATION_WHATSAPP_SIMULATION_ENABLED: "true",
  }, {}, undefined, { conversationOrchestrator: orchestrator });
  const result = await dependencies.whatsappModule?.handleInboundMessage({
    provider: "meta_cloud", messageId: "wamid_1", from: { id: "60123@s.whatsapp.net", phoneNumber: "60123" }, text: "Hello",
    raw: { tenant_id: "tenant_1", venue_id: "venue_1" },
  }) as { content?: string; conversation_id?: string };
  assert.equal(result.content, "Unified WhatsApp reply");
  assert.equal(result.conversation_id, "conversation_1");
  assert.deepEqual((observed[0] as { scope: unknown }).scope, { tenantId: "tenant_1", venueId: "venue_1" });

  observed.length = 0;
  await dependencies.whatsappModule?.handleInboundMessage({
    provider: "session_qr", messageId: "sim_1", from: { id: "demo@s.whatsapp.net" }, text: "Hello",
    raw: { simulated: true, tenant_id: "tenant_1", venue_id: "venue_1" },
  });
  const simulatedInput = (observed[0] as { input: { channel: string; channelThreadId: string } }).input;
  assert.equal(simulatedInput.channel, "simulation");
  assert.equal(simulatedInput.channelThreadId, "simulation:demo@s.whatsapp.net");
});

test("standalone Supabase env factory wires manifest-enabled WhatsApp without legacy enable env", async () => {
  const dependencies = createStandaloneSupabaseDependenciesFromEnv({
    RESERVATION_WHATSAPP_ALLOW_MEMORY_STORE: "true",
    RESERVATION_WHATSAPP_SIMULATION_ENABLED: "true",
    AI_AGENT_API_KEY: "agent-key",
  }, {
    platformConfig: racingSimPlatformConfig(),
    createClient() {
      throw new Error("createClient should not be called for WhatsApp memory store");
    },
    fetch: async () => new Response(JSON.stringify({
      choices: [{ message: { content: "AI reply" } }],
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  });

  assert.equal(typeof dependencies.whatsappModule?.sendConversationMessage, "function");
  assert.equal(typeof dependencies.whatsappModule?.updateConversationAutomationStatus, "function");
  const sessionStatus = await dependencies.whatsappModule?.sessionStatus();
  const readiness = await dependencies.whatsappModule?.readiness() as {
    provider_ready?: boolean;
    simulation_enabled?: boolean;
  };

  assert.equal(sessionStatus?.status, "disconnected");
  assert.equal(readiness.provider_ready, true);
  assert.equal(readiness.simulation_enabled, true);
});

test("standalone Supabase env factory hides staff reply routes when manifest disables staff takeover", () => {
  const dependencies = createStandaloneSupabaseDependenciesFromEnv({
    RESERVATION_WHATSAPP_ALLOW_MEMORY_STORE: "true",
    AI_AGENT_API_KEY: "agent-key",
  }, {
    platformConfig: {
      ...racingSimPlatformConfig(),
      modules: {
        ...racingSimPlatformConfig().modules,
        whatsapp: {
          ...racingSimPlatformConfig().modules.whatsapp,
          automation: {
            ...racingSimPlatformConfig().modules.whatsapp.automation,
            staffTakeover: {
              enabled: false,
              autoMessageOnTakeover: false,
            },
          },
        },
      },
    },
    createClient() {
      throw new Error("createClient should not be called for WhatsApp memory store");
    },
  });

  assert.equal(dependencies.whatsappModule?.updateConversationAutomationStatus, undefined);
  assert.equal(dependencies.whatsappModule?.sendConversationMessage, undefined);
});

test("standalone Supabase env factory wires JWT/JWKS verifier without Supabase config", async () => {
  const fixture = createJwtFixture();
  let fetchCalls = 0;
  const dependencies = createStandaloneSupabaseDependenciesFromEnv({
    RESERVATION_PLATFORM_AUTH_JWKS_URL: "https://issuer.example.com/jwks.json",
    RESERVATION_PLATFORM_AUTH_ISSUER: "https://issuer.example.com",
    RESERVATION_PLATFORM_AUTH_AUDIENCE: "reservation-api, other-api",
    RESERVATION_PLATFORM_AUTH_JWKS_CACHE_TTL_SECONDS: "60",
    RESERVATION_PLATFORM_AUTH_SUBJECT_CLAIM: "uid",
    RESERVATION_PLATFORM_AUTH_TENANT_IDS_CLAIM: "tenants",
  }, {
    fetch: async (...args) => {
      fetchCalls += 1;
      return fixture.fetch(...args);
    },
    createClient() {
      throw new Error("createClient should not be called for auth only");
    },
  });

  assert.equal(typeof dependencies.auth?.verifyBearerToken, "function");

  const token = fixture.signToken({
    uid: "user_123",
    iss: "https://issuer.example.com",
    aud: "reservation-api",
    exp: 4_102_444_800,
    tenants: ["tenant_1"],
  });
  const result = await dependencies.auth?.verifyBearerToken?.({
    token,
    requestContext: {},
    request: { method: "GET", path: "/v1/venues" },
  });
  const cachedResult = await dependencies.auth?.verifyBearerToken?.({
    token,
    requestContext: {},
    request: { method: "GET", path: "/v1/venues" },
  });

  assert.deepEqual(result, {
    ok: true,
    principal: {
      subjectId: "user_123",
      tenantIds: ["tenant_1"],
      roles: [],
      scopes: [],
    },
  });
  assert.equal(cachedResult?.ok, true);
  assert.equal(fetchCalls, 1);
});

test("standalone Supabase env factory fails closed for partial JWT/JWKS config", () => {
  assert.throws(
    () => createStandaloneSupabaseDependenciesFromEnv({
      RESERVATION_PLATFORM_AUTH_JWKS_URL: "https://issuer.example.com/jwks.json",
    }),
    /Missing standalone JWT\/JWKS auth config: issuer, audience/u,
  );
});

test("standalone Supabase env factory fails closed for invalid JWT/JWKS cache TTL config", () => {
  assert.throws(
    () => createStandaloneSupabaseDependenciesFromEnv({
      RESERVATION_PLATFORM_AUTH_JWKS_URL: "https://issuer.example.com/jwks.json",
      RESERVATION_PLATFORM_AUTH_ISSUER: "https://issuer.example.com",
      RESERVATION_PLATFORM_AUTH_AUDIENCE: "reservation-api",
      RESERVATION_PLATFORM_AUTH_JWKS_CACHE_TTL_SECONDS: "-1",
    }),
    /Missing standalone JWT\/JWKS auth config: jwksCacheTtlSeconds/u,
  );
});

test("standalone Supabase runtime fails closed when env config is partial", () => {
  assert.throws(
    () => createStandaloneSupabaseDependenciesFromEnv({
      RESERVATION_SUPABASE_URL: "https://example.supabase.co",
      RESERVATION_SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    }),
    (error) => {
      assert.equal(error instanceof StandaloneSupabaseConfigError, true);
      assert.deepEqual(
        (error as StandaloneSupabaseConfigError).missingConfigKeys,
        ["RESERVATION_SUPABASE_ANON_KEY"],
      );
      return true;
    },
  );
});

test("standalone Supabase runtime wires public and admin clients to repository factories", () => {
  const clients: FakeSupabaseClient[] = [];
  const createClientCalls: Array<{
    url: string;
    key: string;
    persistSession: boolean;
    autoRefreshToken: boolean;
  }> = [];
  const factoryCalls: Array<{
    name: keyof StandaloneSupabaseRepositoryFactories;
    publicClient?: FakeSupabaseClient;
    adminClient: FakeSupabaseClient;
  }> = [];

  const createClient: StandaloneSupabaseClientFactory = (url, key, options) => {
    const client = fakeSupabaseClient(key);
    clients.push(client);
    createClientCalls.push({
      url,
      key,
      persistSession: options.auth.persistSession,
      autoRefreshToken: options.auth.autoRefreshToken,
    });
    return client;
  };

  const dependencies = createStandaloneSupabaseDependencies({
    supabaseUrl: "https://example.supabase.co",
    supabaseAnonKey: "anon-key",
    supabaseServiceRoleKey: "service-role-key",
  }, {
    createClient,
    sessionAllowedOrigins: ["https://console.example"],
    repositoryFactories: recordingRepositoryFactories(factoryCalls),
  });

  assert.deepEqual(createClientCalls, [
    {
      url: "https://example.supabase.co",
      key: "anon-key",
      persistSession: false,
      autoRefreshToken: false,
    },
    {
      url: "https://example.supabase.co",
      key: "service-role-key",
      persistSession: false,
      autoRefreshToken: false,
    },
  ]);

  assert.deepEqual(factoryCalls, [
    { name: "createSessionRepository", adminClient: clients[1] },
    { name: "createCatalogRepository", publicClient: clients[0], adminClient: clients[1] },
    { name: "createAvailabilityRepository", publicClient: clients[0], adminClient: clients[1] },
    { name: "createAnalyticsRepository", adminClient: clients[1] },
    { name: "createConversationRepository", adminClient: clients[1] },
    { name: "createReservationReadRepository", adminClient: clients[1] },
    { name: "createReservationCreateRepository", adminClient: clients[1] },
    { name: "createReservationMutationRepository", adminClient: clients[1] },
    { name: "createReservationManagementRepository", adminClient: clients[1] },
    { name: "createResourceMaintenanceRepository", adminClient: clients[1] },
    { name: "createIdempotencyRepository", adminClient: clients[1] },
    { name: "createInstallationBusinessRepository", adminClient: clients[1] },
    { name: "createInstallationLocationsRepository", adminClient: clients[1] },
    { name: "createExperienceStudioRepository", adminClient: clients[1] },
    { name: "createExperienceKnowledgeRepository", adminClient: clients[1] },
    { name: "createOperatingHoursRepository", adminClient: clients[1] },
    { name: "createOperationsOverviewRepository", adminClient: clients[1] },
    { name: "createIntegrationSettingsRepository", adminClient: clients[1] },
    { name: "createTenantVenueRepository", adminClient: clients[1] },
    { name: "createConversationBookingStateStore", adminClient: clients[1] },
  ]);

  assert.equal(Boolean(dependencies.catalogRepository), true);
  assert.equal(Boolean(dependencies.installationBusinessRepository), true);
  assert.equal(Boolean(dependencies.installationLocationsRepository), true);
  assert.equal(Boolean(dependencies.availabilityRepository), true);
  assert.equal(Boolean(dependencies.analyticsRepository), true);
  assert.equal(Boolean(dependencies.conversationRepository), true);
  assert.equal(Boolean(dependencies.conversationOrchestrator), true);
  assert.equal(Boolean(dependencies.reservationReadRepository), true);
  assert.equal(Boolean(dependencies.reservationCreateRepository), true);
  assert.equal(Boolean(dependencies.reservationManagementRepository), true);
  assert.equal(Boolean(dependencies.reservationMutationRepository), true);
  assert.equal(Boolean(dependencies.resourceMaintenanceRepository), true);
  assert.equal(Boolean(dependencies.idempotencyRepository), true);
  assert.equal(Boolean(dependencies.experienceStudioRepository), true);
  assert.equal(Boolean(dependencies.experienceKnowledgeRepository), true);
  assert.equal(Boolean(dependencies.operatingHoursRepository), true);
  assert.equal(Boolean(dependencies.operationsOverviewRepository), true);
  assert.equal(Boolean(dependencies.integrationSettingsRepository), true);
  assert.equal(Boolean(dependencies.tenantVenueRepository), true);
  assert.deepEqual(dependencies.sessionAuth?.allowedOrigins, ["https://console.example"]);
});

test("standalone Supabase runtime wires installation-key encryption and an injected email connection tester", () => {
  const emailConnectionTester = { async test() {} };
  const dependencies = createStandaloneSupabaseDependencies({
    supabaseUrl: "https://example.supabase.co",
    supabaseAnonKey: "anon-key",
    supabaseServiceRoleKey: "service-role-key",
  }, {
    createClient: (_url, key) => fakeSupabaseClient(key),
    repositoryFactories: recordingRepositoryFactories([]),
    integrationEncryptionKey: "installation-master-key",
    emailConnectionTester,
  });

  const envelope = dependencies.integrationCredentialEncryptor?.({ username: "mailer", password: "secret" });
  assert.ok(envelope);
  assert.equal(JSON.stringify(envelope).includes("secret"), false);
  assert.deepEqual(dependencies.integrationCredentialDecryptor?.(envelope), { username: "mailer", password: "secret" });
  assert.equal(dependencies.emailConnectionTester, emailConnectionTester);

  const withoutKey = createStandaloneSupabaseDependencies({
    supabaseUrl: "https://example.supabase.co",
    supabaseAnonKey: "anon-key",
    supabaseServiceRoleKey: "service-role-key",
  }, {
    createClient: (_url, key) => fakeSupabaseClient(key),
    repositoryFactories: recordingRepositoryFactories([]),
  });
  assert.equal(withoutKey.integrationCredentialEncryptor, undefined);
  assert.equal(withoutKey.integrationCredentialDecryptor, undefined);
});

test("standalone Supabase runtime skips reservation repositories when manifest disables reservations", () => {
  const factoryCalls: Array<{
    name: keyof StandaloneSupabaseRepositoryFactories;
    publicClient?: FakeSupabaseClient;
    adminClient: FakeSupabaseClient;
  }> = [];
  const dependencies = createStandaloneSupabaseDependencies({
    supabaseUrl: "https://example.supabase.co",
    supabaseAnonKey: "anon-key",
    supabaseServiceRoleKey: "service-role-key",
  }, {
    createClient: (_url, key) => fakeSupabaseClient(key),
    repositoryFactories: recordingRepositoryFactories(factoryCalls),
    platformConfig: {
      ...racingSimPlatformConfig(),
      modules: {
        ...racingSimPlatformConfig().modules,
        reservations: { enabled: false },
        ai: { enabled: false },
        whatsapp: {
          enabled: false,
          provider: "session_qr",
          automation: {
            enabled: false,
            mode: "booking_assistant",
            staffTakeover: {
              enabled: true,
              autoMessageOnTakeover: false,
            },
          },
        },
      },
    },
  });

  assert.deepEqual(factoryCalls.map(({ name }) => name), ["createSessionRepository"]);
  assert.equal(Boolean(dependencies.sessionAuth), true);
  assert.equal(dependencies.catalogRepository, undefined);
  assert.equal(dependencies.reservationCreateRepository, undefined);
});

test("standalone Supabase runtime carries service auth beside complete Supabase repositories", () => {
  const dependencies = createStandaloneSupabaseDependencies({
    supabaseUrl: "https://example.supabase.co",
    supabaseAnonKey: "anon-key",
    supabaseServiceRoleKey: "service-role-key",
    serviceApiKey: "platform-service-secret",
  }, {
    createClient: (_url, key) => fakeSupabaseClient(key),
    repositoryFactories: recordingRepositoryFactories([]),
  });

  assert.deepEqual(dependencies.auth, {
    serviceApiKey: "platform-service-secret",
  });
  assert.equal(Boolean(dependencies.tenantVenueRepository), true);
});

test("standalone Supabase readiness requires the package-owned full core migration plan", async () => {
  const plan = migrationReadinessPlan(3);
  const calls: Array<{ table: string; filenames?: readonly string[] }> = [];
  const dependencies = createStandaloneSupabaseDependencies({
    supabaseUrl: "https://example.supabase.co",
    supabaseAnonKey: "anon-key",
    supabaseServiceRoleKey: "service-role-key",
  }, {
    createClient: (_url, key) => key === "service-role-key"
      ? readinessSupabaseClient(calls, plan)
      : fakeSupabaseClient(key),
    loadCoreMigrationPlan: async () => plan,
    repositoryFactories: recordingRepositoryFactories([]),
  });

  assert.deepEqual(await dependencies.readinessCheck?.(), {
    database: true,
    migrations: true,
  });
  assert.deepEqual(calls, [
    { table: "tenants" },
    {
      table: "reservation_local_migration_ledger",
      filenames: plan.map((entry) => entry.path),
    },
  ]);
});

test("standalone Supabase readiness rejects missing and corrupt intermediate migrations", async () => {
  const plan = migrationReadinessPlan(3);
  const missingIntermediate = createStandaloneSupabaseDependencies({
    supabaseUrl: "https://example.supabase.co",
    supabaseAnonKey: "anon-key",
    supabaseServiceRoleKey: "service-role-key",
  }, {
    createClient: (_url, key) => key === "service-role-key"
      ? readinessSupabaseClient([], [plan[0]!, plan[2]!])
      : fakeSupabaseClient(key),
    loadCoreMigrationPlan: async () => plan,
    repositoryFactories: recordingRepositoryFactories([]),
  });
  const corruptIntermediate = createStandaloneSupabaseDependencies({
    supabaseUrl: "https://example.supabase.co",
    supabaseAnonKey: "anon-key",
    supabaseServiceRoleKey: "service-role-key",
  }, {
    createClient: (_url, key) => key === "service-role-key"
      ? readinessSupabaseClient([], [
          plan[0]!,
          { ...plan[1]!, sha256: "f".repeat(64) },
          plan[2]!,
        ])
      : fakeSupabaseClient(key),
    loadCoreMigrationPlan: async () => plan,
    repositoryFactories: recordingRepositoryFactories([]),
  });

  assert.deepEqual(await missingIntermediate.readinessCheck?.(), {
    database: true,
    migrations: false,
  });
  assert.deepEqual(await corruptIntermediate.readinessCheck?.(), {
    database: true,
    migrations: false,
  });
});

test("standalone Supabase readiness distinguishes database and ledger query failures", async () => {
  const plan = migrationReadinessPlan(2);
  const databaseFailure = createStandaloneSupabaseDependencies({
    supabaseUrl: "https://example.supabase.co",
    supabaseAnonKey: "anon-key",
    supabaseServiceRoleKey: "service-role-key",
  }, {
    createClient: (_url, key) => key === "service-role-key"
      ? failingReadinessSupabaseClient("tenants")
      : fakeSupabaseClient(key),
    loadCoreMigrationPlan: async () => plan,
    repositoryFactories: recordingRepositoryFactories([]),
  });
  const migrationFailure = createStandaloneSupabaseDependencies({
    supabaseUrl: "https://example.supabase.co",
    supabaseAnonKey: "anon-key",
    supabaseServiceRoleKey: "service-role-key",
  }, {
    createClient: (_url, key) => key === "service-role-key"
      ? failingReadinessSupabaseClient("reservation_local_migration_ledger")
      : fakeSupabaseClient(key),
    loadCoreMigrationPlan: async () => plan,
    repositoryFactories: recordingRepositoryFactories([]),
  });

  assert.deepEqual(await databaseFailure.readinessCheck?.(), {
    database: false,
    migrations: false,
  });
  assert.deepEqual(await migrationFailure.readinessCheck?.(), {
    database: true,
    migrations: false,
  });
});

test("standalone runtime service token bypasses env JWT verifier", async () => {
  const fixture = createJwtFixture();
  let fetchCalls = 0;
  const dependencies = createStandaloneSupabaseDependenciesFromEnv({
    RESERVATION_PLATFORM_SERVICE_API_KEY: "platform-service-secret",
    RESERVATION_PLATFORM_AUTH_JWKS_URL: "https://issuer.example.com/jwks.json",
    RESERVATION_PLATFORM_AUTH_ISSUER: "https://issuer.example.com",
    RESERVATION_PLATFORM_AUTH_AUDIENCE: "reservation-api",
  }, {
    fetch: async (...args) => {
      fetchCalls += 1;
      return fixture.fetch(...args);
    },
  });
  const handler = createStandaloneApiHandler({
    ...dependencies,
  });

  const response = await handler({
    method: "GET",
    path: "/v1/venues",
    headers: { Authorization: "Bearer platform-service-secret" },
  });

  assert.equal(response.status, 503);
  assert.equal(fetchCalls, 0);
});

type FakeSupabaseClient = StandaloneSupabaseClient & {
  key: string;
};

function fakeSupabaseClient(key: string): FakeSupabaseClient {
  return {
    key,
    from() {
      return {};
    },
    async rpc() {
      return { data: null, error: null };
    },
  };
}

function readinessSupabaseClient(
  calls: Array<{ table: string; filenames?: readonly string[] }>,
  ledgerRows: readonly { path: string; sha256: string }[],
): StandaloneSupabaseClient {
  return {
    from(table: string) {
      let filenames: readonly string[] | undefined;
      const query = {
        select() {
          return query;
        },
        in(_column: string, values: readonly string[]) {
          filenames = values;
          return query;
        },
        async limit() {
          calls.push({ table, ...(filenames ? { filenames } : {}) });
          return {
            data: table === "reservation_local_migration_ledger"
              ? ledgerRows.map((entry) => ({ filename: entry.path, sha256: entry.sha256 }))
              : [],
            error: null,
          };
        },
      };
      return query;
    },
  };
}

function failingReadinessSupabaseClient(failingTable: string): StandaloneSupabaseClient {
  return {
    from(table: string) {
      const query = {
        select() {
          return query;
        },
        in() {
          return query;
        },
        async limit() {
          return table === failingTable
            ? { data: null, error: { message: "sensitive database detail" } }
            : { data: [], error: null };
        },
      };
      return query;
    },
  };
}

function migrationReadinessPlan(length: number) {
  return Array.from({ length }, (_, index) => ({
    path: `packages/database/migrations/supabase/${String(index + 1).padStart(6, "0")}_test.sql`,
    sha256: String(index + 1).repeat(64).slice(0, 64),
  }));
}

function recordingRepositoryFactories(
  calls: Array<{
    name: keyof StandaloneSupabaseRepositoryFactories;
    publicClient?: FakeSupabaseClient;
    adminClient: FakeSupabaseClient;
  }>,
): StandaloneSupabaseRepositoryFactories {
  const repository = {} as NonNullable<StandaloneApiDependencies[keyof StandaloneApiDependencies]>;

  return {
    createCatalogRepository(input) {
      recordPublicAdminFactoryCall(calls, "createCatalogRepository", input);
      return repository as NonNullable<StandaloneApiDependencies["catalogRepository"]>;
    },
    createAvailabilityRepository(input) {
      recordPublicAdminFactoryCall(calls, "createAvailabilityRepository", input);
      return repository as NonNullable<StandaloneApiDependencies["availabilityRepository"]>;
    },
    createAnalyticsRepository(client) {
      recordAdminFactoryCall(calls, "createAnalyticsRepository", client);
      return repository as NonNullable<StandaloneApiDependencies["analyticsRepository"]>;
    },
    createConversationRepository(client) {
      recordAdminFactoryCall(calls, "createConversationRepository", client);
      return repository as NonNullable<StandaloneApiDependencies["conversationRepository"]>;
    },
    createConversationBookingStateStore(client) {
      recordAdminFactoryCall(calls, "createConversationBookingStateStore", client);
      return new InMemoryConversationBookingStateStore();
    },
    createReservationReadRepository(client) {
      recordAdminFactoryCall(calls, "createReservationReadRepository", client);
      return repository as NonNullable<StandaloneApiDependencies["reservationReadRepository"]>;
    },
    createReservationCreateRepository(client) {
      recordAdminFactoryCall(calls, "createReservationCreateRepository", client);
      return repository as NonNullable<StandaloneApiDependencies["reservationCreateRepository"]>;
    },
    createReservationMutationRepository(client) {
      recordAdminFactoryCall(calls, "createReservationMutationRepository", client);
      return repository as NonNullable<StandaloneApiDependencies["reservationMutationRepository"]>;
    },
    createReservationManagementRepository(client) {
      recordAdminFactoryCall(calls, "createReservationManagementRepository", client);
      return repository as NonNullable<StandaloneApiDependencies["reservationManagementRepository"]>;
    },
    createResourceMaintenanceRepository(client) {
      recordAdminFactoryCall(calls, "createResourceMaintenanceRepository", client);
      return repository as NonNullable<StandaloneApiDependencies["resourceMaintenanceRepository"]>;
    },
    createIdempotencyRepository(client) {
      recordAdminFactoryCall(calls, "createIdempotencyRepository", client);
      return repository as NonNullable<StandaloneApiDependencies["idempotencyRepository"]>;
    },
    createInstallationBusinessRepository(client) {
      recordAdminFactoryCall(calls, "createInstallationBusinessRepository", client);
      return repository as NonNullable<StandaloneApiDependencies["installationBusinessRepository"]>;
    },
    createInstallationLocationsRepository(client) {
      recordAdminFactoryCall(calls, "createInstallationLocationsRepository", client);
      return repository as NonNullable<StandaloneApiDependencies["installationLocationsRepository"]>;
    },
    createExperienceStudioRepository(client) {
      recordAdminFactoryCall(calls, "createExperienceStudioRepository", client);
      return repository as NonNullable<StandaloneApiDependencies["experienceStudioRepository"]>;
    },
    createExperienceKnowledgeRepository(client) {
      recordAdminFactoryCall(calls, "createExperienceKnowledgeRepository", client);
      return repository as NonNullable<StandaloneApiDependencies["experienceKnowledgeRepository"]>;
    },
    createOperatingHoursRepository(client) {
      recordAdminFactoryCall(calls, "createOperatingHoursRepository", client);
      return repository as NonNullable<StandaloneApiDependencies["operatingHoursRepository"]>;
    },
    createOperationsOverviewRepository(client) {
      recordAdminFactoryCall(calls, "createOperationsOverviewRepository", client);
      return repository as NonNullable<StandaloneApiDependencies["operationsOverviewRepository"]>;
    },
    createIntegrationSettingsRepository(client) {
      recordAdminFactoryCall(calls, "createIntegrationSettingsRepository", client);
      return repository as NonNullable<StandaloneApiDependencies["integrationSettingsRepository"]>;
    },
    createTenantVenueRepository(client) {
      recordAdminFactoryCall(calls, "createTenantVenueRepository", client);
      return repository as NonNullable<StandaloneApiDependencies["tenantVenueRepository"]>;
    },
    createSessionRepository(client) {
      recordAdminFactoryCall(calls, "createSessionRepository", client);
      return repository as NonNullable<StandaloneApiDependencies["sessionAuth"]>["repositories"];
    },
  };
}

function recordPublicAdminFactoryCall(
  calls: Array<{
    name: keyof StandaloneSupabaseRepositoryFactories;
    publicClient?: FakeSupabaseClient;
    adminClient: FakeSupabaseClient;
  }>,
  name: keyof StandaloneSupabaseRepositoryFactories,
  input: StandaloneSupabasePublicAdminClients,
) {
  calls.push({
    name,
    publicClient: input.publicClient as FakeSupabaseClient,
    adminClient: input.adminClient as FakeSupabaseClient,
  });
}

function recordAdminFactoryCall(
  calls: Array<{
    name: keyof StandaloneSupabaseRepositoryFactories;
    publicClient?: FakeSupabaseClient;
    adminClient: FakeSupabaseClient;
  }>,
  name: keyof StandaloneSupabaseRepositoryFactories,
  client: StandaloneSupabaseClient,
) {
  calls.push({
    name,
    adminClient: client as FakeSupabaseClient,
  });
}

function createJwtFixture() {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const kid = "test-key";
  const publicJwk = publicKey.export({ format: "jwk" });
  const jwks = {
    keys: [{
      ...publicJwk,
      kid,
      alg: "RS256",
      use: "sig",
    }],
  };

  return {
    fetch: async (_input: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify(jwks), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
    signToken(payload: Record<string, unknown>) {
      const encodedHeader = base64UrlJson({ alg: "RS256", kid, typ: "JWT" });
      const encodedPayload = base64UrlJson(payload);
      const signingInput = `${encodedHeader}.${encodedPayload}`;
      const signature = sign("RSA-SHA256", Buffer.from(signingInput), privateKey);
      return `${signingInput}.${signature.toString("base64url")}`;
    },
  };
}

function base64UrlJson(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function racingSimPlatformConfig() {
  return {
    version: 1 as const,
    app: "Racing Sim",
    modules: {
      reservations: { enabled: true },
      ai: {
        enabled: true,
        provider: "openai-compatible" as const,
        baseUrl: "https://openrouter.ai/api/v1",
        model: "openai/gpt-4.1-mini",
      },
      whatsapp: {
        enabled: true,
        provider: "session_qr" as const,
        automation: {
          enabled: true,
          mode: "booking_assistant" as const,
          staffTakeover: {
            enabled: true,
            autoMessageOnTakeover: false,
          },
        },
      },
      inAppChat: { enabled: false },
    },
  };
}
