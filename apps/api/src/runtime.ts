import { createClient as createSupabaseClient } from "@supabase/supabase-js";
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

  return {
    ...authDependencies,
    catalogRepository: repositoryFactories.createCatalogRepository(publicAdminClients),
    availabilityRepository: repositoryFactories.createAvailabilityRepository(publicAdminClients),
    reservationReadRepository: repositoryFactories.createReservationReadRepository(adminClient),
    reservationCreateRepository: repositoryFactories.createReservationCreateRepository(adminClient),
    reservationMutationRepository: repositoryFactories.createReservationMutationRepository(adminClient),
    resourceMaintenanceRepository: repositoryFactories.createResourceMaintenanceRepository(adminClient),
    idempotencyRepository: repositoryFactories.createIdempotencyRepository(adminClient),
    tenantVenueRepository: repositoryFactories.createTenantVenueRepository(adminClient),
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
    return authDependencies;
  }

  return {
    ...createStandaloneSupabaseDependencies(config, options),
    ...authDependencies,
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
