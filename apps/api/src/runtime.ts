import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { MetadataRecord } from "@reservation-platform/contract-types";
import {
  createReservation,
  getPlatformService,
  listAvailability,
  listPlatformServices,
  prepareLegacyReservationCreate,
  type AvailabilityRepositoryPort,
  type PlatformCatalogRepository,
  type ReservationCreateRepositoryPort,
} from "@reservation-platform/api";
import {
  createSupabaseAvailabilityRepository,
  createSupabaseIdempotencyRepository,
  createSupabasePlatformCatalogRepository,
  createSupabaseReservationMutationRepository,
  createSupabaseReservationReadRepository,
  createSupabaseReservationRepository,
  createSupabaseResourceMaintenanceRepository,
  createSupabaseTenantVenueRepository,
} from "@project-play/reservations-supabase";
import {
  BaileysWhatsAppSessionAdapter,
  createWhatsAppBookingAutomationResponder,
  createWhatsAppBusinessModuleFromEnv,
  createWhatsAppAgentRuntimeFromEnv,
  InMemoryWhatsAppModuleStore,
  SupabaseWhatsAppModuleStore,
  type SupabaseWhatsAppClient,
  type WhatsAppReservationTools,
  type WhatsAppModuleStore,
} from "@reservation-platform/whatsapp";

import { createStandaloneJwtJwksBearerTokenVerifier } from "./jwt-verifier.js";
import type { StandaloneApiDependencies } from "./routes.js";

export const STANDALONE_SUPABASE_ENV_NAMES = {
  url: "RESERVATION_SUPABASE_URL",
  anonKey: "RESERVATION_SUPABASE_ANON_KEY",
  serviceRoleKey: "RESERVATION_SUPABASE_SERVICE_ROLE_KEY",
  serviceApiKey: "RESERVATION_PLATFORM_SERVICE_API_KEY",
  authJwksUrl: "RESERVATION_PLATFORM_AUTH_JWKS_URL",
  authIssuer: "RESERVATION_PLATFORM_AUTH_ISSUER",
  authAudience: "RESERVATION_PLATFORM_AUTH_AUDIENCE",
  authAlgorithms: "RESERVATION_PLATFORM_AUTH_ALGORITHMS",
  authClockToleranceSeconds: "RESERVATION_PLATFORM_AUTH_CLOCK_TOLERANCE_SECONDS",
  authJwksCacheTtlSeconds: "RESERVATION_PLATFORM_AUTH_JWKS_CACHE_TTL_SECONDS",
  authSubjectClaim: "RESERVATION_PLATFORM_AUTH_SUBJECT_CLAIM",
  authTenantIdsClaim: "RESERVATION_PLATFORM_AUTH_TENANT_IDS_CLAIM",
  authVenueIdsClaim: "RESERVATION_PLATFORM_AUTH_VENUE_IDS_CLAIM",
  authRolesClaim: "RESERVATION_PLATFORM_AUTH_ROLES_CLAIM",
  authScopesClaim: "RESERVATION_PLATFORM_AUTH_SCOPES_CLAIM",
  corsAllowedOrigins: "RESERVATION_PLATFORM_CORS_ALLOWED_ORIGINS",
  whatsappEnabled: "RESERVATION_WHATSAPP_ENABLED",
  whatsappProvider: "RESERVATION_WHATSAPP_PROVIDER",
  whatsappSessionAuthDir: "RESERVATION_WHATSAPP_SESSION_AUTH_DIR",
  whatsappSessionEncryptionKey: "RESERVATION_WHATSAPP_SESSION_ENCRYPTION_KEY",
  whatsappAllowMemoryStore: "RESERVATION_WHATSAPP_ALLOW_MEMORY_STORE",
} as const;

export interface StandaloneSupabaseConfig {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  supabaseServiceRoleKey?: string;
  serviceApiKey?: string;
}

export interface StandaloneSupabaseEnv extends Record<string, string | undefined> {
  RESERVATION_SUPABASE_URL?: string;
  RESERVATION_SUPABASE_ANON_KEY?: string;
  RESERVATION_SUPABASE_SERVICE_ROLE_KEY?: string;
  RESERVATION_PLATFORM_SERVICE_API_KEY?: string;
  RESERVATION_PLATFORM_AUTH_JWKS_URL?: string;
  RESERVATION_PLATFORM_AUTH_ISSUER?: string;
  RESERVATION_PLATFORM_AUTH_AUDIENCE?: string;
  RESERVATION_PLATFORM_AUTH_ALGORITHMS?: string;
  RESERVATION_PLATFORM_AUTH_CLOCK_TOLERANCE_SECONDS?: string;
  RESERVATION_PLATFORM_AUTH_JWKS_CACHE_TTL_SECONDS?: string;
  RESERVATION_PLATFORM_AUTH_SUBJECT_CLAIM?: string;
  RESERVATION_PLATFORM_AUTH_TENANT_IDS_CLAIM?: string;
  RESERVATION_PLATFORM_AUTH_VENUE_IDS_CLAIM?: string;
  RESERVATION_PLATFORM_AUTH_ROLES_CLAIM?: string;
  RESERVATION_PLATFORM_AUTH_SCOPES_CLAIM?: string;
  RESERVATION_PLATFORM_CORS_ALLOWED_ORIGINS?: string;
  RESERVATION_WHATSAPP_ENABLED?: string;
  RESERVATION_WHATSAPP_PROVIDER?: string;
  RESERVATION_WHATSAPP_SESSION_AUTH_DIR?: string;
  RESERVATION_WHATSAPP_SESSION_ENCRYPTION_KEY?: string;
  RESERVATION_WHATSAPP_ALLOW_MEMORY_STORE?: string;
  AI_AGENT_PROVIDER?: string;
  AI_AGENT_BASE_URL?: string;
  AI_AGENT_API_KEY?: string;
  AI_AGENT_MODEL?: string;
  RESERVATION_WHATSAPP_SIMULATION_ENABLED?: string;
}

export interface StandaloneSupabaseClient {
  from(table: string): unknown;
  rpc?(
    fn: string,
    params?: Record<string, unknown>,
  ): Promise<StandaloneSupabaseQueryResult<unknown>>;
}

export interface StandaloneSupabaseQueryResult<T> {
  data: T | null;
  error: {
    message?: string;
    code?: string;
    status?: number;
    [key: string]: unknown;
  } | null;
}

export interface StandaloneSupabaseClientOptions {
  auth: {
    autoRefreshToken: false;
    persistSession: false;
  };
}

export type StandaloneSupabaseClientFactory = (
  supabaseUrl: string,
  supabaseKey: string,
  options: StandaloneSupabaseClientOptions,
) => StandaloneSupabaseClient;

export interface StandaloneSupabaseRepositoryFactories {
  createCatalogRepository(input: StandaloneSupabasePublicAdminClients): NonNullable<StandaloneApiDependencies["catalogRepository"]>;
  createAvailabilityRepository(input: StandaloneSupabasePublicAdminClients): NonNullable<StandaloneApiDependencies["availabilityRepository"]>;
  createReservationReadRepository(client: StandaloneSupabaseClient): NonNullable<StandaloneApiDependencies["reservationReadRepository"]>;
  createReservationCreateRepository(client: StandaloneSupabaseClient): NonNullable<StandaloneApiDependencies["reservationCreateRepository"]>;
  createReservationMutationRepository(client: StandaloneSupabaseClient): NonNullable<StandaloneApiDependencies["reservationMutationRepository"]>;
  createResourceMaintenanceRepository(client: StandaloneSupabaseClient): NonNullable<StandaloneApiDependencies["resourceMaintenanceRepository"]>;
  createIdempotencyRepository(client: StandaloneSupabaseClient): NonNullable<StandaloneApiDependencies["idempotencyRepository"]>;
  createTenantVenueRepository(client: StandaloneSupabaseClient): NonNullable<StandaloneApiDependencies["tenantVenueRepository"]>;
}

export interface StandaloneSupabaseRuntimeOptions {
  createClient?: StandaloneSupabaseClientFactory;
  fetch?: typeof fetch;
  repositoryFactories?: Partial<StandaloneSupabaseRepositoryFactories>;
}

export interface StandaloneSupabasePublicAdminClients {
  publicClient: StandaloneSupabaseClient;
  adminClient: StandaloneSupabaseClient;
}

export class StandaloneSupabaseConfigError extends Error {
  readonly missingConfigKeys: string[];

  constructor(missingConfigKeys: string[]) {
    super(`Missing standalone Supabase runtime config: ${missingConfigKeys.join(", ")}`);
    this.name = "StandaloneSupabaseConfigError";
    this.missingConfigKeys = missingConfigKeys;
  }
}

const standaloneSupabaseClientOptions = {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
} as const satisfies StandaloneSupabaseClientOptions;

const defaultRepositoryFactories: StandaloneSupabaseRepositoryFactories = {
  createCatalogRepository: createSupabasePlatformCatalogRepository,
  createAvailabilityRepository: createSupabaseAvailabilityRepository,
  createReservationReadRepository: createSupabaseReservationReadRepository,
  createReservationCreateRepository: createSupabaseReservationRepository,
  createReservationMutationRepository: createSupabaseReservationMutationRepository,
  createResourceMaintenanceRepository: createSupabaseResourceMaintenanceRepository,
  createIdempotencyRepository: createSupabaseIdempotencyRepository,
  createTenantVenueRepository: createSupabaseTenantVenueRepository,
};

export function createStandaloneSupabaseDependencies(
  config: StandaloneSupabaseConfig,
  options: StandaloneSupabaseRuntimeOptions = {},
): StandaloneApiDependencies {
  const normalizedConfig = normalizeStandaloneSupabaseConfig(config);
  assertCompleteStandaloneSupabaseConfig(normalizedConfig);

  const createClient = options.createClient ?? defaultStandaloneSupabaseClientFactory;
  const repositoryFactories = {
    ...defaultRepositoryFactories,
    ...options.repositoryFactories,
  };

  const publicClient = createClient(
    normalizedConfig.supabaseUrl,
    normalizedConfig.supabaseAnonKey,
    standaloneSupabaseClientOptions,
  );
  const adminClient = createClient(
    normalizedConfig.supabaseUrl,
    normalizedConfig.supabaseServiceRoleKey,
    standaloneSupabaseClientOptions,
  );
  const publicAdminClients = { publicClient, adminClient };
  const authDependencies = standaloneServiceAuthDependenciesFromConfig(normalizedConfig);
  const platformDependencies = {
    catalogRepository: repositoryFactories.createCatalogRepository(publicAdminClients),
    availabilityRepository: repositoryFactories.createAvailabilityRepository(publicAdminClients),
    reservationReadRepository: repositoryFactories.createReservationReadRepository(adminClient),
    reservationCreateRepository: repositoryFactories.createReservationCreateRepository(adminClient),
    reservationMutationRepository: repositoryFactories.createReservationMutationRepository(adminClient),
    resourceMaintenanceRepository: repositoryFactories.createResourceMaintenanceRepository(adminClient),
    idempotencyRepository: repositoryFactories.createIdempotencyRepository(adminClient),
    tenantVenueRepository: repositoryFactories.createTenantVenueRepository(adminClient),
  };

  return {
    ...authDependencies,
    ...platformDependencies,
  };
}

export function createStandaloneSupabaseDependenciesFromEnv(
  env: StandaloneSupabaseEnv = process.env,
  options: StandaloneSupabaseRuntimeOptions = {},
): StandaloneApiDependencies {
  const config = standaloneSupabaseConfigFromEnv(env);
  const normalizedConfig = normalizeStandaloneSupabaseConfig(config);
  const authDependencies = standaloneAuthDependenciesFromEnv(env, normalizedConfig.serviceApiKey, options);

  if (!hasAnyStandaloneSupabaseConfig(config)) {
    return {
      ...authDependencies,
      ...standaloneWhatsAppDependenciesFromEnv(env, options),
    };
  }

  const supabaseDependencies = createStandaloneSupabaseDependencies(config, options);
  return {
    ...supabaseDependencies,
    ...authDependencies,
    ...standaloneWhatsAppDependenciesFromEnv(env, options, normalizedConfig, supabaseDependencies),
  };
}

export function standaloneSupabaseConfigFromEnv(env: StandaloneSupabaseEnv): StandaloneSupabaseConfig {
  return {
    supabaseUrl: env.RESERVATION_SUPABASE_URL,
    supabaseAnonKey: env.RESERVATION_SUPABASE_ANON_KEY,
    supabaseServiceRoleKey: env.RESERVATION_SUPABASE_SERVICE_ROLE_KEY,
    serviceApiKey: env.RESERVATION_PLATFORM_SERVICE_API_KEY,
  };
}

export function createStandaloneCorsOptionsFromEnv(env: StandaloneSupabaseEnv = process.env) {
  return {
    allowedOrigins: splitEnvList(env.RESERVATION_PLATFORM_CORS_ALLOWED_ORIGINS),
  };
}

export function standaloneWhatsAppDependenciesFromEnv(
  env: StandaloneSupabaseEnv = process.env,
  options: StandaloneSupabaseRuntimeOptions = {},
  config?: Required<StandaloneSupabaseConfig>,
  platformDependencies: Pick<StandaloneApiDependencies, "availabilityRepository" | "catalogRepository" | "reservationCreateRepository"> = {},
): Pick<StandaloneApiDependencies, "whatsappModule"> {
  if (!isEnabledEnv(env.RESERVATION_WHATSAPP_ENABLED)) {
    return {};
  }

  const provider = env.RESERVATION_WHATSAPP_PROVIDER;
  const sessionEncryptionKey = env.RESERVATION_WHATSAPP_SESSION_ENCRYPTION_KEY;
  const allowMemoryStore = isEnabledEnv(env.RESERVATION_WHATSAPP_ALLOW_MEMORY_STORE);
  if (!config && !allowMemoryStore) {
    throw new StandaloneSupabaseConfigError([
      STANDALONE_SUPABASE_ENV_NAMES.url,
      STANDALONE_SUPABASE_ENV_NAMES.anonKey,
      STANDALONE_SUPABASE_ENV_NAMES.serviceRoleKey,
    ]);
  }

  const createClient = options.createClient ?? defaultStandaloneSupabaseClientFactory;
  const store: WhatsAppModuleStore = config
    ? new SupabaseWhatsAppModuleStore(createClient(
        config.supabaseUrl,
        config.supabaseServiceRoleKey,
        standaloneSupabaseClientOptions,
      ) as unknown as SupabaseWhatsAppClient)
    : new InMemoryWhatsAppModuleStore();
  let service: ReturnType<typeof createWhatsAppBusinessModuleFromEnv>;
  const sessionAdapter = provider === "meta_cloud"
    ? undefined
    : new BaileysWhatsAppSessionAdapter({
        authDirectory: env.RESERVATION_WHATSAPP_SESSION_AUTH_DIR?.trim() || ".reservation-whatsapp-sessions",
        onInboundMessage: async (message) => {
          await service.handleInboundMessage(message);
        },
        onStatusChange: (status, metadata) => updateWhatsAppSessionConnectionStatus(store, status, metadata),
      });
  void sessionEncryptionKey;
  const agentRuntime = createWhatsAppAgentRuntimeFromEnv(env, { fetch: options.fetch });
  const reservationTools = platformDependencies.catalogRepository &&
      platformDependencies.availabilityRepository &&
      platformDependencies.reservationCreateRepository
    ? createWhatsAppReservationTools(platformDependencies as {
        catalogRepository: PlatformCatalogRepository;
        availabilityRepository: AvailabilityRepositoryPort;
        reservationCreateRepository: ReservationCreateRepositoryPort;
      })
    : undefined;
  service = createWhatsAppBusinessModuleFromEnv({
    ...env,
    RESERVATION_WHATSAPP_PROVIDER: provider,
  }, {
    responder: createWhatsAppBookingAutomationResponder({
      agentRuntime,
      reservationTools,
      readiness: {
        databaseReady: Boolean(config),
        providerReady: Boolean(agentRuntime),
      },
    }),
    sessionAdapter,
    store,
  });
  return {
    whatsappModule: {
      startSession: (input) => service.startSession(input),
      sessionStatus: () => service.sessionStatus(),
      sessionQr: () => service.sessionQr(),
      logoutSession: () => service.logoutSession(),
      getConfig: () => service.getConfig(),
      updateConfig: (input) => service.updateConfig(input),
      listKnowledge: () => service.listKnowledge(),
      createKnowledge: (input) => service.createKnowledge(input),
      updateKnowledge: (knowledgeId, input) => service.updateKnowledge(knowledgeId, input),
      deleteKnowledge: (knowledgeId) => service.deleteKnowledge(knowledgeId),
      listConversations: () => service.listConversations(),
      listConversationMessages: (conversationId) => service.listConversationMessages(conversationId),
      handleInboundMessage: (input) => {
        if (!isEnabledEnv(env.RESERVATION_WHATSAPP_SIMULATION_ENABLED)) {
          const error = new Error("WhatsApp inbound simulation is disabled.");
          error.name = "WhatsAppSimulationDisabledError";
          throw error;
        }
        return service.handleInboundMessage(input);
      },
      readiness: async () => ({
        database_ready: Boolean(config),
        provider_ready: Boolean(agentRuntime),
        reservation_tools_ready: Boolean(reservationTools),
        simulation_enabled: isEnabledEnv(env.RESERVATION_WHATSAPP_SIMULATION_ENABLED),
      }),
    },
  };
}

function createWhatsAppReservationTools(input: {
  catalogRepository: PlatformCatalogRepository;
  availabilityRepository: AvailabilityRepositoryPort;
  reservationCreateRepository: ReservationCreateRepositoryPort;
}): WhatsAppReservationTools {
  return {
    async listServices() {
      const result = await listPlatformServices(input.catalogRepository);
      return "services" in result.body ? result.body.services : [];
    },
    async getService(serviceId) {
      const result = await getPlatformService(input.catalogRepository, serviceId);
      return "service_id" in result.body ? result.body : undefined;
    },
    async checkAvailability({ serviceId, date }) {
      const result = await listAvailability({
        repository: input.availabilityRepository,
        query: new URLSearchParams({ service_id: serviceId, date }),
      });
      if (!("slots" in result.body)) {
        throw new Error(result.body.error.message);
      }
      return result.body;
    },
    async createReservation(reservation) {
      const legacy = prepareLegacyReservationCreate(reservation);
      const result = await createReservation({
        repository: input.reservationCreateRepository,
        legacyInput: legacy.legacyInput,
      });
      if (!("reservation_id" in result.body)) {
        throw new Error(result.body.error.message);
      }
      return result.body;
    },
  };
}

async function updateWhatsAppSessionConnectionStatus(
  store: WhatsAppModuleStore,
  status: "pending_qr" | "connected" | "disconnected" | "expired",
  metadata: MetadataRecord | undefined,
) {
  if (status === "pending_qr") {
    return;
  }

  const existing = await store.load();
  if (!existing) {
    return;
  }

  const updatedAt = new Date().toISOString();
  await store.save({
    ...existing,
    status,
    qr_code: status === "connected" || status === "expired" ? undefined : existing.qr_code,
    connected_at: status === "connected" ? existing.connected_at ?? updatedAt : existing.connected_at,
    updated_at: updatedAt,
    metadata: {
      ...(existing.metadata ?? {}),
      ...(metadata ?? {}),
    },
  });
}

function defaultStandaloneSupabaseClientFactory(
  supabaseUrl: string,
  supabaseKey: string,
  options: StandaloneSupabaseClientOptions,
) {
  return createSupabaseClient(supabaseUrl, supabaseKey, options) as unknown as StandaloneSupabaseClient;
}

function normalizeStandaloneSupabaseConfig(config: StandaloneSupabaseConfig): Required<StandaloneSupabaseConfig> {
  return {
    supabaseUrl: config.supabaseUrl?.trim() ?? "",
    supabaseAnonKey: config.supabaseAnonKey?.trim() ?? "",
    supabaseServiceRoleKey: config.supabaseServiceRoleKey?.trim() ?? "",
    serviceApiKey: config.serviceApiKey?.trim() ?? "",
  };
}

function hasAnyStandaloneSupabaseConfig(config: StandaloneSupabaseConfig) {
  return Boolean(
    config.supabaseUrl?.trim()
      || config.supabaseAnonKey?.trim()
      || config.supabaseServiceRoleKey?.trim(),
  );
}

function standaloneServiceAuthDependenciesFromConfig(
  config: Required<StandaloneSupabaseConfig>,
): Pick<StandaloneApiDependencies, "auth"> {
  if (!config.serviceApiKey) {
    return {};
  }

  return {
    auth: {
      serviceApiKey: config.serviceApiKey,
    },
  };
}

interface StandaloneJwtJwksEnvConfig {
  issuer: string;
  audience: readonly string[];
  jwksUrl: string;
  algorithms?: readonly string[];
  clockToleranceSeconds?: number;
  jwksCacheTtlSeconds?: number;
  claimNames?: {
    subject?: string;
    tenantIds?: string;
    venueIds?: string;
    roles?: string;
    scopes?: string;
  };
}

function standaloneJwtJwksConfigFromEnv(env: StandaloneSupabaseEnv): StandaloneJwtJwksEnvConfig {
  const clockTolerance = env.RESERVATION_PLATFORM_AUTH_CLOCK_TOLERANCE_SECONDS?.trim();
  const jwksCacheTtl = env.RESERVATION_PLATFORM_AUTH_JWKS_CACHE_TTL_SECONDS?.trim();
  return {
    issuer: env.RESERVATION_PLATFORM_AUTH_ISSUER?.trim() ?? "",
    audience: splitEnvList(env.RESERVATION_PLATFORM_AUTH_AUDIENCE),
    jwksUrl: env.RESERVATION_PLATFORM_AUTH_JWKS_URL?.trim() ?? "",
    algorithms: optionalEnvList(env.RESERVATION_PLATFORM_AUTH_ALGORITHMS),
    clockToleranceSeconds: clockTolerance ? Number(clockTolerance) : undefined,
    jwksCacheTtlSeconds: jwksCacheTtl ? Number(jwksCacheTtl) : undefined,
    claimNames: {
      subject: trimOptional(env.RESERVATION_PLATFORM_AUTH_SUBJECT_CLAIM),
      tenantIds: trimOptional(env.RESERVATION_PLATFORM_AUTH_TENANT_IDS_CLAIM),
      venueIds: trimOptional(env.RESERVATION_PLATFORM_AUTH_VENUE_IDS_CLAIM),
      roles: trimOptional(env.RESERVATION_PLATFORM_AUTH_ROLES_CLAIM),
      scopes: trimOptional(env.RESERVATION_PLATFORM_AUTH_SCOPES_CLAIM),
    },
  };
}

function hasAnyStandaloneJwtJwksConfig(config: StandaloneJwtJwksEnvConfig) {
  return Boolean(
    config.issuer
      || config.jwksUrl
      || config.audience.length > 0
      || (config.algorithms !== undefined && config.algorithms.length > 0)
      || config.clockToleranceSeconds !== undefined
      || config.jwksCacheTtlSeconds !== undefined
      || Object.values(config.claimNames ?? {}).some(Boolean),
  );
}

function standaloneAuthDependenciesFromEnv(
  env: StandaloneSupabaseEnv,
  serviceApiKey: string,
  options: StandaloneSupabaseRuntimeOptions,
): Pick<StandaloneApiDependencies, "auth"> {
  const jwksConfig = standaloneJwtJwksConfigFromEnv(env);
  if (!serviceApiKey && !hasAnyStandaloneJwtJwksConfig(jwksConfig)) {
    return {};
  }

  const auth: NonNullable<StandaloneApiDependencies["auth"]> = {
    ...(serviceApiKey ? { serviceApiKey } : {}),
  };

  if (hasAnyStandaloneJwtJwksConfig(jwksConfig)) {
    auth.verifyBearerToken = createStandaloneJwtJwksBearerTokenVerifier({
      issuer: jwksConfig.issuer,
      audience: jwksConfig.audience,
      jwksUrl: jwksConfig.jwksUrl,
      algorithms: jwksConfig.algorithms,
      clockToleranceSeconds: jwksConfig.clockToleranceSeconds,
      jwksCacheTtlSeconds: jwksConfig.jwksCacheTtlSeconds,
      claimNames: jwksConfig.claimNames,
      fetch: options.fetch,
    });
  }

  return { auth };
}

function splitEnvList(value: string | undefined) {
  return Array.from(new Set(
    (value ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  ));
}

function isEnabledEnv(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function optionalEnvList(value: string | undefined) {
  const values = splitEnvList(value);
  return values.length === 0 ? undefined : values;
}

function trimOptional(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function assertCompleteStandaloneSupabaseConfig(config: Required<StandaloneSupabaseConfig>) {
  const missingConfigKeys: string[] = [];

  if (!config.supabaseUrl) {
    missingConfigKeys.push(STANDALONE_SUPABASE_ENV_NAMES.url);
  }

  if (!config.supabaseAnonKey) {
    missingConfigKeys.push(STANDALONE_SUPABASE_ENV_NAMES.anonKey);
  }

  if (!config.supabaseServiceRoleKey) {
    missingConfigKeys.push(STANDALONE_SUPABASE_ENV_NAMES.serviceRoleKey);
  }

  if (missingConfigKeys.length > 0) {
    throw new StandaloneSupabaseConfigError(missingConfigKeys);
  }
}
