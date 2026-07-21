import { platformConfigPathEnvName } from "@reservation-platform/platform-config";

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
  sessionCookieSecure: "RESERVATION_SESSION_COOKIE_SECURE",
  whatsappEnabled: "RESERVATION_WHATSAPP_ENABLED",
  whatsappProvider: "RESERVATION_WHATSAPP_PROVIDER",
  whatsappSessionAuthDir: "RESERVATION_WHATSAPP_SESSION_AUTH_DIR",
  whatsappSessionEncryptionKey: "RESERVATION_WHATSAPP_SESSION_ENCRYPTION_KEY",
  whatsappAllowMemoryStore: "RESERVATION_WHATSAPP_ALLOW_MEMORY_STORE",
  installationMasterKey: "RESERVATION_INSTALLATION_MASTER_KEY",
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
  RESERVATION_SESSION_COOKIE_SECURE?: string;
  RESERVATION_WHATSAPP_ENABLED?: string;
  RESERVATION_WHATSAPP_PROVIDER?: string;
  RESERVATION_WHATSAPP_SESSION_AUTH_DIR?: string;
  RESERVATION_WHATSAPP_SESSION_ENCRYPTION_KEY?: string;
  RESERVATION_WHATSAPP_ALLOW_MEMORY_STORE?: string;
  RESERVATION_INSTALLATION_MASTER_KEY?: string;
  RESERVATION_RELEASE_VERSION?: string;
  RESERVATION_REQUIRED_MIGRATION_VERSION?: string;
  RESERVATION_PLATFORM_CONFIG_PATH?: string;
  AI_AGENT_PROVIDER?: string;
  AI_AGENT_BASE_URL?: string;
  AI_AGENT_API_KEY?: string;
  AI_AGENT_MODEL?: string;
  RESERVATION_WHATSAPP_SIMULATION_ENABLED?: string;
}

export class StandaloneSupabaseConfigError extends Error {
  readonly missingConfigKeys: string[];

  constructor(missingConfigKeys: string[]) {
    super(`Missing standalone Supabase runtime config: ${missingConfigKeys.join(", ")}`);
    this.name = "StandaloneSupabaseConfigError";
    this.missingConfigKeys = missingConfigKeys;
  }
}

export class StandaloneSessionCookieConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StandaloneSessionCookieConfigError";
  }
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
  return { allowedOrigins: splitEnvList(env.RESERVATION_PLATFORM_CORS_ALLOWED_ORIGINS) };
}

export function readSessionSecureCookiesFromEnv(env: StandaloneSupabaseEnv = process.env) {
  const configured = env.RESERVATION_SESSION_COOKIE_SECURE?.trim().toLowerCase();
  if (!configured || configured === "true") return true;
  if (configured !== "false") {
    throw new StandaloneSessionCookieConfigError(
      `${STANDALONE_SUPABASE_ENV_NAMES.sessionCookieSecure} must be true or false.`,
    );
  }
  const allowedOrigins = createStandaloneCorsOptionsFromEnv(env).allowedOrigins;
  if (allowedOrigins.length === 0 || allowedOrigins.some((origin) => !isLoopbackHttpOrigin(origin))) {
    throw new StandaloneSessionCookieConfigError(
      `${STANDALONE_SUPABASE_ENV_NAMES.sessionCookieSecure}=false is allowed only with loopback HTTP origins.`,
    );
  }
  return false;
}

function isLoopbackHttpOrigin(origin: string) {
  try {
    const url = new URL(origin);
    return url.protocol === "http:"
      && (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]")
      && url.pathname === "/" && !url.username && !url.password && !url.search && !url.hash;
  } catch {
    return false;
  }
}

export function normalizeStandaloneSupabaseConfig(config: StandaloneSupabaseConfig): Required<StandaloneSupabaseConfig> {
  return {
    supabaseUrl: config.supabaseUrl?.trim() ?? "",
    supabaseAnonKey: config.supabaseAnonKey?.trim() ?? "",
    supabaseServiceRoleKey: config.supabaseServiceRoleKey?.trim() ?? "",
    serviceApiKey: config.serviceApiKey?.trim() ?? "",
  };
}

export function hasAnyStandaloneSupabaseConfig(config: StandaloneSupabaseConfig) {
  return Boolean(config.supabaseUrl?.trim() || config.supabaseAnonKey?.trim() || config.supabaseServiceRoleKey?.trim());
}

export function assertCompleteStandaloneSupabaseConfig(config: Required<StandaloneSupabaseConfig>) {
  const missingConfigKeys: string[] = [];
  if (!config.supabaseUrl) missingConfigKeys.push(STANDALONE_SUPABASE_ENV_NAMES.url);
  if (!config.supabaseAnonKey) missingConfigKeys.push(STANDALONE_SUPABASE_ENV_NAMES.anonKey);
  if (!config.supabaseServiceRoleKey) missingConfigKeys.push(STANDALONE_SUPABASE_ENV_NAMES.serviceRoleKey);
  if (missingConfigKeys.length > 0) throw new StandaloneSupabaseConfigError(missingConfigKeys);
}

export function splitEnvList(value: string | undefined) {
  return Array.from(new Set((value ?? "").split(",").map((item) => item.trim()).filter(Boolean)));
}

export function isEnabledEnv(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function optionalEnvList(value: string | undefined) {
  const values = splitEnvList(value);
  return values.length === 0 ? undefined : values;
}

export function trimOptional(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
