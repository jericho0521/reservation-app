import { createHash } from "node:crypto";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import {
  loadBundledCoreMigrationPlan,
  type CoreMigrationLedgerEntry,
} from "@reservation-platform/database";
import {
  loadPlatformRuntimeConfigFromEnv,
  PlatformRuntimeConfigError,
  platformConfigPathEnvName,
  type PlatformRuntimeConfig,
} from "@reservation-platform/platform-config";
import type { MetadataRecord } from "@reservation-platform/contract-types";
import {
  createReservation,
  confirmConversationBooking,
  createAgentConversationResponder,
  createDeterministicConversationResponder,
  getPlatformService,
  handleConversationInbound,
  InMemoryConversationBookingStateStore,
  listAvailability,
  listExperienceKnowledge,
  listPlatformServices,
  prepareLegacyReservationCreate,
  type AvailabilityRepositoryPort,
  type ConversationOrchestratorDependencies,
  type ExperienceScope,
  type PlatformCatalogRepository,
  type ReservationCreateRepositoryPort,
} from "@reservation-platform/api";
import {
  createSupabaseAvailabilityRepository,
  createSupabaseAnalyticsRepository,
  createSupabaseConversationRepository,
  createSupabaseExperienceStudioRepository,
  createSupabaseExperienceKnowledgeRepository,
  createSupabaseIdempotencyRepository,
  createSupabaseOperatingHoursRepository,
  createSupabaseOperationsOverviewRepository,
  createSupabasePlatformCatalogRepository,
  createSupabaseReservationMutationRepository,
  createSupabaseReservationManagementRepository,
  createSupabaseReservationReadRepository,
  createSupabaseReservationRepository,
  createSupabaseResourceMaintenanceRepository,
  createSupabaseTenantVenueRepository,
  type ExperienceSupabaseLikeClient,
  type ExperienceKnowledgeSupabaseClient,
  type ReservationManagementSupabaseClient,
  type ConversationSupabaseClient,
  type OperationsOverviewSupabaseClient,
  type AnalyticsSupabaseClient,
} from "@project-play/reservations-supabase";
import {
  BaileysWhatsAppSessionAdapter,
  createWhatsAppBookingAutomationResponder,
  createWhatsAppBusinessModuleFromEnv,
  createWhatsAppAgentRuntimeFromSettings,
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
  platformConfigPath: platformConfigPathEnvName,
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
  RESERVATION_PLATFORM_CONFIG_PATH?: string;
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

interface StandaloneSupabaseReadinessQuery {
  select(columns: string): StandaloneSupabaseReadinessQuery;
  in(column: string, values: readonly string[]): StandaloneSupabaseReadinessQuery;
  limit(count: number): PromiseLike<StandaloneSupabaseQueryResult<unknown[]>>;
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
  createAnalyticsRepository(client: StandaloneSupabaseClient): NonNullable<StandaloneApiDependencies["analyticsRepository"]>;
  createConversationRepository(client: StandaloneSupabaseClient): NonNullable<StandaloneApiDependencies["conversationRepository"]>;
  createReservationReadRepository(client: StandaloneSupabaseClient): NonNullable<StandaloneApiDependencies["reservationReadRepository"]>;
  createReservationCreateRepository(client: StandaloneSupabaseClient): NonNullable<StandaloneApiDependencies["reservationCreateRepository"]>;
  createReservationMutationRepository(client: StandaloneSupabaseClient): NonNullable<StandaloneApiDependencies["reservationMutationRepository"]>;
  createReservationManagementRepository(client: StandaloneSupabaseClient): NonNullable<StandaloneApiDependencies["reservationManagementRepository"]>;
  createResourceMaintenanceRepository(client: StandaloneSupabaseClient): NonNullable<StandaloneApiDependencies["resourceMaintenanceRepository"]>;
  createIdempotencyRepository(client: StandaloneSupabaseClient): NonNullable<StandaloneApiDependencies["idempotencyRepository"]>;
  createExperienceStudioRepository(client: StandaloneSupabaseClient): NonNullable<StandaloneApiDependencies["experienceStudioRepository"]>;
  createExperienceKnowledgeRepository(client: StandaloneSupabaseClient): NonNullable<StandaloneApiDependencies["experienceKnowledgeRepository"]>;
  createOperatingHoursRepository(client: StandaloneSupabaseClient): NonNullable<StandaloneApiDependencies["operatingHoursRepository"]>;
  createOperationsOverviewRepository(client: StandaloneSupabaseClient): NonNullable<StandaloneApiDependencies["operationsOverviewRepository"]>;
  createTenantVenueRepository(client: StandaloneSupabaseClient): NonNullable<StandaloneApiDependencies["tenantVenueRepository"]>;
}

export interface StandaloneSupabaseRuntimeOptions {
  createClient?: StandaloneSupabaseClientFactory;
  fetch?: typeof fetch;
  loadCoreMigrationPlan?: () => Promise<readonly CoreMigrationLedgerEntry[]>;
  platformConfig?: PlatformRuntimeConfig;
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
  createAnalyticsRepository: (client) => createSupabaseAnalyticsRepository(client as unknown as AnalyticsSupabaseClient),
  createConversationRepository: (client) => createSupabaseConversationRepository(client as unknown as ConversationSupabaseClient),
  createReservationReadRepository: createSupabaseReservationReadRepository,
  createReservationCreateRepository: createSupabaseReservationRepository,
  createReservationMutationRepository: createSupabaseReservationMutationRepository,
  createReservationManagementRepository: (client) => createSupabaseReservationManagementRepository(
    client as unknown as ReservationManagementSupabaseClient,
  ),
  createResourceMaintenanceRepository: createSupabaseResourceMaintenanceRepository,
  createIdempotencyRepository: createSupabaseIdempotencyRepository,
  createExperienceStudioRepository: (client) => createSupabaseExperienceStudioRepository(
    client as unknown as ExperienceSupabaseLikeClient,
  ),
  createExperienceKnowledgeRepository: (client) => createSupabaseExperienceKnowledgeRepository(
    client as unknown as ExperienceKnowledgeSupabaseClient,
  ),
  createOperatingHoursRepository: (client) => {
    if (!client.rpc) throw new Error("Supabase client does not support RPC calls");
    return createSupabaseOperatingHoursRepository({ rpc: client.rpc.bind(client) });
  },
  createOperationsOverviewRepository: (client) => createSupabaseOperationsOverviewRepository(client as unknown as OperationsOverviewSupabaseClient),
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
  const reservationsEnabled = options.platformConfig ? options.platformConfig.modules.reservations.enabled : true;
  const platformDependencies = reservationsEnabled
    ? {
        catalogRepository: repositoryFactories.createCatalogRepository(publicAdminClients),
        availabilityRepository: repositoryFactories.createAvailabilityRepository(publicAdminClients),
        analyticsRepository: repositoryFactories.createAnalyticsRepository(adminClient),
        conversationRepository: repositoryFactories.createConversationRepository(adminClient),
        reservationReadRepository: repositoryFactories.createReservationReadRepository(adminClient),
        reservationCreateRepository: repositoryFactories.createReservationCreateRepository(adminClient),
        reservationMutationRepository: repositoryFactories.createReservationMutationRepository(adminClient),
        reservationManagementRepository: repositoryFactories.createReservationManagementRepository(adminClient),
        resourceMaintenanceRepository: repositoryFactories.createResourceMaintenanceRepository(adminClient),
        idempotencyRepository: repositoryFactories.createIdempotencyRepository(adminClient),
        experienceStudioRepository: repositoryFactories.createExperienceStudioRepository(adminClient),
        experienceKnowledgeRepository: repositoryFactories.createExperienceKnowledgeRepository(adminClient),
        operatingHoursRepository: repositoryFactories.createOperatingHoursRepository(adminClient),
        operationsOverviewRepository: repositoryFactories.createOperationsOverviewRepository(adminClient),
        tenantVenueRepository: repositoryFactories.createTenantVenueRepository(adminClient),
      }
    : {};
  const conversationOrchestrator = createWebChatOrchestrator(platformDependencies);

  return {
    ...authDependencies,
    ...platformDependencies,
    readinessCheck: createStandaloneSupabaseReadinessCheck(
      adminClient,
      options.loadCoreMigrationPlan ?? loadBundledCoreMigrationPlan,
    ),
    ...(conversationOrchestrator ? { conversationOrchestrator } : {}),
  };
}

function createStandaloneSupabaseReadinessCheck(
  adminClient: StandaloneSupabaseClient,
  loadCoreMigrationPlan: () => Promise<readonly CoreMigrationLedgerEntry[]>,
): NonNullable<StandaloneApiDependencies["readinessCheck"]> {
  return async () => {
    const databaseResult = await runStandaloneSupabaseReadinessQuery(() => (
      asReadinessQuery(adminClient.from("tenants"))
        .select("id")
        .limit(1)
    ));
    if (!databaseResult.ok) {
      return { database: false, migrations: false };
    }

    let migrationPlan: readonly CoreMigrationLedgerEntry[];
    try {
      migrationPlan = await loadCoreMigrationPlan();
    } catch {
      return { database: true, migrations: false };
    }
    if (migrationPlan.length === 0) {
      return { database: true, migrations: false };
    }

    const migrationResult = await runStandaloneSupabaseReadinessQuery(() => (
      asReadinessQuery(adminClient.from("reservation_local_migration_ledger"))
        .select("filename, sha256")
        .in("filename", migrationPlan.map((entry) => entry.path))
        .limit(migrationPlan.length)
    ));

    return {
      database: true,
      migrations: migrationResult.ok && migrationLedgerMatchesPlan(migrationResult.rows, migrationPlan),
    };
  };
}

function migrationLedgerMatchesPlan(
  rows: readonly unknown[],
  migrationPlan: readonly CoreMigrationLedgerEntry[],
) {
  if (rows.length !== migrationPlan.length) {
    return false;
  }

  const checksumsByPath = new Map<string, string>();
  for (const row of rows) {
    if (!isRecord(row) || typeof row.filename !== "string" || typeof row.sha256 !== "string") {
      return false;
    }
    checksumsByPath.set(row.filename, row.sha256);
  }

  return migrationPlan.every((entry) => checksumsByPath.get(entry.path) === entry.sha256);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asReadinessQuery(value: unknown) {
  return value as StandaloneSupabaseReadinessQuery;
}

async function runStandaloneSupabaseReadinessQuery(
  query: () => PromiseLike<StandaloneSupabaseQueryResult<unknown[]>>,
): Promise<{ ok: true; rows: unknown[] } | { ok: false; rows: [] }> {
  try {
    const result = await query();
    if (result.error || !Array.isArray(result.data)) {
      return { ok: false, rows: [] };
    }
    return { ok: true, rows: result.data };
  } catch {
    return { ok: false, rows: [] };
  }
}

export function createStandaloneSupabaseDependenciesFromEnv(
  env: StandaloneSupabaseEnv = process.env,
  options: StandaloneSupabaseRuntimeOptions = {},
): StandaloneApiDependencies {
  const platformConfig = options.platformConfig ?? loadPlatformRuntimeConfigFromEnv({
    ...env,
    RESERVATION_PLATFORM_CONFIG_PATH: env.RESERVATION_PLATFORM_CONFIG_PATH,
  });
  const runtimeOptions = {
    ...options,
    platformConfig,
  };
  const config = standaloneSupabaseConfigFromEnv(env);
  const normalizedConfig = normalizeStandaloneSupabaseConfig(config);
  const authDependencies = standaloneAuthDependenciesFromEnv(env, normalizedConfig.serviceApiKey, runtimeOptions);

  if (!hasAnyStandaloneSupabaseConfig(config)) {
    return {
      ...authDependencies,
      ...standaloneWhatsAppDependenciesFromEnv(env, runtimeOptions),
    };
  }

  const supabaseDependencies = createStandaloneSupabaseDependencies(config, runtimeOptions);
  const agentRuntime = createWebChatAgentRuntime(env, platformConfig, options.fetch);
  if (platformConfig?.modules.ai.enabled && !agentRuntime) {
    throw new PlatformRuntimeConfigError(["modules.ai.enabled requires AI_AGENT_API_KEY plus provider baseUrl and model"]);
  }
  const conversationOrchestrator = createWebChatOrchestrator(supabaseDependencies, agentRuntime);
  return {
    ...supabaseDependencies,
    ...authDependencies,
    ...(conversationOrchestrator ? { conversationOrchestrator } : {}),
    ...standaloneWhatsAppDependenciesFromEnv(env, runtimeOptions, normalizedConfig, supabaseDependencies),
  };
}

function createWebChatAgentRuntime(env: StandaloneSupabaseEnv, platformConfig: PlatformRuntimeConfig | undefined, fetchImpl?: typeof fetch) {
  const settings = platformConfig?.modules.ai.enabled ? platformConfig.modules.ai : undefined;
  return settings
    ? createWhatsAppAgentRuntimeFromSettings(settings, env, { fetch: fetchImpl })
    : createWhatsAppAgentRuntimeFromEnv(env, { fetch: fetchImpl });
}

function createWebChatOrchestrator(
  dependencies: StandaloneApiDependencies,
  agentRuntime?: ReturnType<typeof createWhatsAppAgentRuntimeFromEnv>,
): ConversationOrchestratorDependencies | undefined {
  const {
    conversationRepository: conversations,
    catalogRepository,
    availabilityRepository,
    reservationCreateRepository,
    experienceStudioRepository,
    experienceKnowledgeRepository,
  } = dependencies;
  if (!conversations || !catalogRepository || !availabilityRepository || !reservationCreateRepository || !experienceStudioRepository || !experienceKnowledgeRepository) return undefined;
  const responder = agentRuntime
    ? createAgentConversationResponder(agentRuntime)
    : createDeterministicConversationResponder();
  return {
    conversations,
    state: new InMemoryConversationBookingStateStore(),
    responder,
    async loadExperience(scope) {
      const [workspace, knowledgeResult, servicesResult] = await Promise.all([
        experienceStudioRepository.readWorkspace(scope),
        listExperienceKnowledge({ scope, repository: experienceKnowledgeRepository }),
        listPlatformServices(catalogRepository, { venueId: scope.venueId }),
      ]);
      if (!workspace || !("entries" in knowledgeResult.body) || !("services" in servicesResult.body)) throw new Error("Experience context unavailable.");
      return {
        businessName: workspace.profile.name,
        knowledge: knowledgeResult.body.entries.map((entry) => ({ question: entry.question, answer: entry.answer })),
        services: servicesResult.body.services.map((service) => ({ serviceId: service.service_id, name: service.name })),
      };
    },
    tools: createConversationBookingTools({ catalogRepository, availabilityRepository, reservationCreateRepository }),
  };
}

function createConversationBookingTools(input: {
  catalogRepository: PlatformCatalogRepository;
  availabilityRepository: AvailabilityRepositoryPort;
  reservationCreateRepository: ReservationCreateRepositoryPort;
}): ConversationOrchestratorDependencies["tools"] {
  return {
    async getService(_scope: ExperienceScope, serviceId: string) {
      const result = await getPlatformService(input.catalogRepository, serviceId);
      return "service_id" in result.body ? result.body : undefined;
    },
    async checkAvailability(_scope: ExperienceScope, { serviceId, date }) {
      const result = await listAvailability({ repository: input.availabilityRepository, query: new URLSearchParams({ service_id: serviceId, date }) });
      if (!("slots" in result.body)) throw new Error(result.body.error.message);
      return result.body;
    },
    async createReservation(_scope: ExperienceScope, reservation) {
      const legacy = prepareLegacyReservationCreate(reservation);
      const result = await createReservation({ repository: input.reservationCreateRepository, legacyInput: legacy.legacyInput });
      if (!("reservation_id" in result.body)) throw new Error(result.body.error.message);
      return result.body;
    },
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
  platformDependencies: Pick<StandaloneApiDependencies, "availabilityRepository" | "catalogRepository" | "reservationCreateRepository" | "conversationOrchestrator"> = {},
): Pick<StandaloneApiDependencies, "whatsappModule"> {
  const platformConfig = options.platformConfig;
  const whatsappConfig = platformConfig?.modules.whatsapp;
  const whatsappEnabled = platformConfig ? whatsappConfig?.enabled === true : isEnabledEnv(env.RESERVATION_WHATSAPP_ENABLED);
  if (!whatsappEnabled) {
    return {};
  }

  const provider = platformConfig ? whatsappConfig?.provider : env.RESERVATION_WHATSAPP_PROVIDER;
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
      ) as unknown as SupabaseWhatsAppClient, { requireEncryptedCredentials: Boolean(sessionEncryptionKey?.trim()) })
    : new InMemoryWhatsAppModuleStore();
  let service: ReturnType<typeof createWhatsAppBusinessModuleFromEnv>;
  const sessionAdapter = provider === "meta_cloud"
    ? undefined
    : new BaileysWhatsAppSessionAdapter({
        authDirectory: env.RESERVATION_WHATSAPP_SESSION_AUTH_DIR?.trim() || ".reservation-whatsapp-sessions",
        sessionEncryptionKey,
        onInboundMessage: async (message) => {
          await service.handleInboundMessage(message);
        },
        onStatusChange: (status, metadata) => updateWhatsAppSessionConnectionStatus(store, status, metadata),
      });
  const aiSettings = platformConfig?.modules.ai.enabled ? platformConfig.modules.ai : undefined;
  const agentRuntime = platformConfig
    ? createWhatsAppAgentRuntimeFromSettings(aiSettings, env, { fetch: options.fetch })
    : createWhatsAppAgentRuntimeFromEnv(env, { fetch: options.fetch });
  if (platformConfig?.modules.ai.enabled && !agentRuntime) {
    throw new PlatformRuntimeConfigError(["modules.ai.enabled requires AI_AGENT_API_KEY plus provider baseUrl and model"]);
  }
  const reservationTools = platformDependencies.catalogRepository &&
      platformDependencies.availabilityRepository &&
      platformDependencies.reservationCreateRepository
    ? createWhatsAppReservationTools(platformDependencies as {
        catalogRepository: PlatformCatalogRepository;
        availabilityRepository: AvailabilityRepositoryPort;
        reservationCreateRepository: ReservationCreateRepositoryPort;
      })
    : undefined;
  const staffTakeoverEnabled = platformConfig
    ? whatsappConfig?.automation.staffTakeover.enabled !== false
    : true;
  const unifiedConversations = platformDependencies.conversationOrchestrator
    ? createWhatsAppUnifiedConversationBridge(store, platformDependencies.conversationOrchestrator)
    : undefined;
  service = createWhatsAppBusinessModuleFromEnv({
    ...env,
    RESERVATION_WHATSAPP_ENABLED: whatsappEnabled ? "true" : "false",
    RESERVATION_WHATSAPP_PROVIDER: provider,
  }, {
    responder: createWhatsAppBookingAutomationResponder({
      agentRuntime,
      reservationTools,
      readiness: {
        databaseReady: Boolean(config),
      },
    }),
    automationEnabled: platformConfig ? whatsappConfig?.automation.enabled === true : true,
    sessionAdapter,
    store,
    unifiedConversations,
  });
  if (sessionAdapter) {
    void service.restoreSessionConnection().catch((error) => {
      console.error("Failed to restore WhatsApp session connection.", error);
    });
  }
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
      ...(staffTakeoverEnabled ? {
        updateConversationAutomationStatus: (input) => service.updateConversationAutomationStatus(input),
        sendConversationMessage: (input) => service.sendConversationMessage(input),
      } : {}),
      handleInboundMessage: (input) => {
        if (!isEnabledEnv(env.RESERVATION_WHATSAPP_SIMULATION_ENABLED)) {
          const error = new Error("WhatsApp inbound simulation is disabled.");
          error.name = "WhatsAppSimulationDisabledError";
          throw error;
        }
        return service.handleInboundMessage(input);
      },
      sendDirectMessage: (input) => service.sendDirectMessage(input),
      readiness: async () => {
        const session = await service.sessionStatus().catch(() => undefined);
        const businessConfig = await service.getConfig().catch(() => undefined);
        const databaseReady = Boolean(config);
        const providerReady = Boolean(agentRuntime);
        const reservationToolsReady = Boolean(reservationTools);
        const businessConfigValid = Boolean(
          businessConfig?.business_name?.trim() &&
            businessConfig?.fallback_message?.trim(),
        );
        const defaultServiceConfigured = Boolean(businessConfig?.default_service_id?.trim());
        const whatsappConnected = session?.status === "connected";
        const aiHealthy = providerReady && reservationToolsReady;
        const missingRequirements = [
          databaseReady ? undefined : "database",
          providerReady ? undefined : "ai_provider",
          reservationToolsReady ? undefined : "reservation_tools",
          businessConfigValid ? undefined : "business_config",
          defaultServiceConfigured ? undefined : "default_service_id",
          whatsappConnected ? undefined : "whatsapp_connected",
        ].filter((requirement): requirement is string => Boolean(requirement));

        return {
          enabled: true,
          provider: provider === "meta_cloud" ? "meta_cloud" : "session_qr",
          database_ready: databaseReady,
          provider_ready: providerReady,
          reservation_tools_ready: reservationToolsReady,
          business_config_valid: businessConfigValid,
          default_service_configured: defaultServiceConfigured,
          whatsapp_connected: whatsappConnected,
          simulation_enabled: isEnabledEnv(env.RESERVATION_WHATSAPP_SIMULATION_ENABLED),
          production_ready: missingRequirements.length === 0,
          missing_requirements: missingRequirements,
          ai: {
            configured: providerReady,
            connected: providerReady,
            healthy: aiHealthy,
            message: providerReady ? (aiHealthy ? "AI booking tools are ready." : "AI is configured but booking tools are unavailable.") : "Configure an AI provider.",
          },
          whatsapp: {
            configured: businessConfigValid && defaultServiceConfigured,
            connected: whatsappConnected,
            healthy: missingRequirements.length === 0,
            message: missingRequirements.length === 0 ? "WhatsApp automation is ready." : `Complete setup: ${missingRequirements.join(", ")}.`,
          },
        };
      },
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

function createWhatsAppUnifiedConversationBridge(
  store: WhatsAppModuleStore,
  orchestrator: ConversationOrchestratorDependencies,
) {
  const pendingByThread = new Map<string, { conversationId: string; proposalId: string }>();
  return {
    async handleInbound(message: import("@reservation-platform/whatsapp").WhatsAppInboundMessage) {
      const scope = await readWhatsAppConversationScope(store, message.raw);
      const content = message.text?.trim() || "[Unsupported WhatsApp content]";
      const channel = message.raw?.simulated === true ? "simulation" as const : "whatsapp" as const;
      const channelThreadId = channel === "simulation" ? `simulation:${message.from.id}` : message.from.id;
      const participant = {
        channelIdentifier: message.from.id,
        identifierHash: createHash("sha256").update(message.from.id).digest("hex"),
        displayName: message.from.displayName,
        contactHint: contactHint(message.from.phoneNumber ?? message.from.id),
      };
      const pending = pendingByThread.get(channelThreadId);
      if (pending && /^(confirm|yes|confirm booking)$/iu.test(content)) {
        const conversation = await orchestrator.conversations.getOrCreate(scope, {
          channel,
          channelThreadId,
          participant,
        });
        if (conversation.error || !conversation.data) throw new Error("WhatsApp conversation is unavailable.");
        const inbound = await orchestrator.conversations.append(scope, conversation.data.conversation_id, {
          channel,
          direction: "inbound",
          senderType: "customer",
          deliveryState: "delivered",
          externalMessageId: message.messageId,
          content,
          metadata: { provider: message.provider, explicit_confirmation: true },
        });
        if (inbound.error) throw new Error("WhatsApp confirmation could not be recorded.");
        const result = await confirmConversationBooking({
          scope,
          conversationId: pending.conversationId,
          proposalId: pending.proposalId,
          dependencies: orchestrator,
        });
        if ("error" in result.body) {
          if (result.body.error.code === "conflict" && result.body.error.message.includes("Staff")) {
            return { conversation_id: pending.conversationId, content: "", automation_suppressed: true };
          }
          throw new Error(result.body.error.message);
        }
        pendingByThread.delete(channelThreadId);
        return unifiedWhatsAppResult(result.body);
      }

      const result = await handleConversationInbound({
        scope,
        message: {
          channel,
          channelThreadId,
          externalMessageId: message.messageId,
          content,
          participant,
        },
        dependencies: orchestrator,
      });
      if ("error" in result.body) throw new Error(result.body.error.message);
      if (result.body.proposal) {
        pendingByThread.set(channelThreadId, {
          conversationId: result.body.conversation.conversation_id,
          proposalId: result.body.proposal.proposalId,
        });
      }
      return unifiedWhatsAppResult(result.body);
    },
  };
}

function unifiedWhatsAppResult(body: Exclude<Awaited<ReturnType<typeof handleConversationInbound>>["body"], { error: unknown }>) {
  return {
    conversation_id: body.conversation.conversation_id,
    content: body.message?.direction === "outbound" ? body.message.content : "",
    ...(body.automation_suppressed ? { automation_suppressed: true } : {}),
    metadata: {
      unified_conversation: true,
      ...(body.proposal ? { proposal_id: body.proposal.proposalId } : {}),
      ...(body.reservation ? { reservation_id: body.reservation.reservation_id } : {}),
    },
  };
}

async function readWhatsAppConversationScope(store: WhatsAppModuleStore, messageMetadata?: MetadataRecord): Promise<ExperienceScope> {
  const session = await store.load();
  const tenant = session?.metadata?.tenant_id ?? messageMetadata?.tenant_id;
  const venue = session?.metadata?.venue_id ?? messageMetadata?.venue_id;
  const tenantId = typeof tenant === "string" ? tenant.trim() : "";
  const venueId = typeof venue === "string" ? venue.trim() : "";
  if (!tenantId || !venueId) throw new Error("WhatsApp session tenant and venue scope are required.");
  return { tenantId, venueId };
}

function contactHint(value: string) {
  const normalized = value.replace(/@.*$/u, "").replace(/\s+/gu, "");
  return normalized.length > 4 ? `***${normalized.slice(-4)}` : "***";
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
