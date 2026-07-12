import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";

import { createStandaloneApiHandler } from "./routes.js";
import type { StandaloneApiDependencies } from "./routes.js";
import {
  createStandaloneSupabaseDependencies,
  createStandaloneSupabaseDependenciesFromEnv,
  StandaloneSupabaseConfigError,
  type StandaloneSupabaseClient,
  type StandaloneSupabaseClientFactory,
  type StandaloneSupabasePublicAdminClients,
  type StandaloneSupabaseRepositoryFactories,
} from "./runtime.js";

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
    { name: "createCatalogRepository", publicClient: clients[0], adminClient: clients[1] },
    { name: "createAvailabilityRepository", publicClient: clients[0], adminClient: clients[1] },
    { name: "createReservationReadRepository", adminClient: clients[1] },
    { name: "createReservationCreateRepository", adminClient: clients[1] },
    { name: "createReservationMutationRepository", adminClient: clients[1] },
    { name: "createResourceMaintenanceRepository", adminClient: clients[1] },
    { name: "createIdempotencyRepository", adminClient: clients[1] },
    { name: "createExperienceStudioRepository", adminClient: clients[1] },
    { name: "createOperatingHoursRepository", adminClient: clients[1] },
    { name: "createTenantVenueRepository", adminClient: clients[1] },
  ]);

  assert.equal(Boolean(dependencies.catalogRepository), true);
  assert.equal(Boolean(dependencies.availabilityRepository), true);
  assert.equal(Boolean(dependencies.reservationReadRepository), true);
  assert.equal(Boolean(dependencies.reservationCreateRepository), true);
  assert.equal(Boolean(dependencies.reservationMutationRepository), true);
  assert.equal(Boolean(dependencies.resourceMaintenanceRepository), true);
  assert.equal(Boolean(dependencies.idempotencyRepository), true);
  assert.equal(Boolean(dependencies.experienceStudioRepository), true);
  assert.equal(Boolean(dependencies.operatingHoursRepository), true);
  assert.equal(Boolean(dependencies.tenantVenueRepository), true);
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

  assert.deepEqual(factoryCalls, []);
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
    createResourceMaintenanceRepository(client) {
      recordAdminFactoryCall(calls, "createResourceMaintenanceRepository", client);
      return repository as NonNullable<StandaloneApiDependencies["resourceMaintenanceRepository"]>;
    },
    createIdempotencyRepository(client) {
      recordAdminFactoryCall(calls, "createIdempotencyRepository", client);
      return repository as NonNullable<StandaloneApiDependencies["idempotencyRepository"]>;
    },
    createExperienceStudioRepository(client) {
      recordAdminFactoryCall(calls, "createExperienceStudioRepository", client);
      return repository as NonNullable<StandaloneApiDependencies["experienceStudioRepository"]>;
    },
    createOperatingHoursRepository(client) {
      recordAdminFactoryCall(calls, "createOperatingHoursRepository", client);
      return repository as NonNullable<StandaloneApiDependencies["operatingHoursRepository"]>;
    },
    createTenantVenueRepository(client) {
      recordAdminFactoryCall(calls, "createTenantVenueRepository", client);
      return repository as NonNullable<StandaloneApiDependencies["tenantVenueRepository"]>;
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
