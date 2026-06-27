export const defaultFrontendPort = 4000;
export const defaultBackendPort = 4100;
export const frontendOriginEnvName = "RESERVATION_FRONTEND_DEV_ORIGIN";
export const backendOriginEnvName = "RESERVATION_BACKEND_DEV_ORIGIN";

export const supabaseEnvNames = [
  "RESERVATION_SUPABASE_URL",
  "RESERVATION_SUPABASE_ANON_KEY",
  "RESERVATION_SUPABASE_SERVICE_ROLE_KEY",
];

export const authJwksRequiredEnvNames = [
  "RESERVATION_PLATFORM_AUTH_JWKS_URL",
  "RESERVATION_PLATFORM_AUTH_ISSUER",
  "RESERVATION_PLATFORM_AUTH_AUDIENCE",
];

export const authJwksOptionalEnvNames = [
  "RESERVATION_PLATFORM_AUTH_ALGORITHMS",
  "RESERVATION_PLATFORM_AUTH_CLOCK_TOLERANCE_SECONDS",
  "RESERVATION_PLATFORM_AUTH_JWKS_CACHE_TTL_SECONDS",
  "RESERVATION_PLATFORM_AUTH_SUBJECT_CLAIM",
  "RESERVATION_PLATFORM_AUTH_TENANT_IDS_CLAIM",
  "RESERVATION_PLATFORM_AUTH_VENUE_IDS_CLAIM",
  "RESERVATION_PLATFORM_AUTH_ROLES_CLAIM",
  "RESERVATION_PLATFORM_AUTH_SCOPES_CLAIM",
];

export const serviceAuthEnvName = "RESERVATION_PLATFORM_SERVICE_API_KEY";
export const corsEnvName = "RESERVATION_PLATFORM_CORS_ALLOWED_ORIGINS";

export const frontendPlatformEnv = {
  mode: "NEXT_PUBLIC_RESERVATION_API_MODE",
  chatMode: "NEXT_PUBLIC_RESERVATION_CHAT_MODE",
  baseUrl: "NEXT_PUBLIC_RESERVATION_PLATFORM_BASE_URL",
};

export function readLocalPlatformDevConfig(env = process.env, argv = []) {
  const errors = [];
  const frontendPort = defaultFrontendPort;
  const backendPort = readPort(env.PORT ?? env.RESERVATION_BACKEND_PORT, defaultBackendPort, "backend port", errors);
  const frontendOrigin = trim(env[frontendOriginEnvName]) || `http://localhost:${frontendPort}`;
  const backendOrigin = trim(env[backendOriginEnvName]) || `http://127.0.0.1:${backendPort}`;
  const corsAllowedOrigins = trim(env[corsEnvName]) || [
    frontendOrigin,
    `http://127.0.0.1:${frontendPort}`,
  ].join(",");
  const supabaseConfigured = configuredNames(env, supabaseEnvNames);
  const supabaseMissing = supabaseConfigured.length > 0
    ? supabaseEnvNames.filter((name) => !trim(env[name]))
    : [];
  const authConfigured = configuredNames(env, [
    ...authJwksRequiredEnvNames,
    ...authJwksOptionalEnvNames,
  ]);
  const authMissing = authConfigured.length > 0
    ? authJwksRequiredEnvNames.filter((name) => !trim(env[name]))
    : [];
  const serviceAuthConfigured = Boolean(trim(env[serviceAuthEnvName]));
  const hasBackendDatabase = supabaseEnvNames.every((name) => Boolean(trim(env[name])));

  if (trim(env.PORT_FRONTEND) || trim(env.NEXT_PORT)) {
    errors.push("Frontend dev port override is not supported by dev:platform yet; use the fixed frontend port 4000.");
  }
  if (supabaseMissing.length > 0) {
    errors.push(`Supabase backend config is partial. Add ${supabaseMissing.join(", ")} or remove the partial RESERVATION_SUPABASE_* values.`);
  }
  if (authMissing.length > 0) {
    errors.push(`JWT/JWKS auth config is partial. Add ${authMissing.join(", ")} or remove the partial RESERVATION_PLATFORM_AUTH_* values.`);
  }

  return {
    ok: errors.length === 0,
    errors,
    frontendPort,
    backendPort,
    frontendOrigin,
    backendOrigin,
    corsAllowedOrigins,
    hasBackendDatabase,
    serviceAuthConfigured,
    jwtAuthConfigured: authJwksRequiredEnvNames.every((name) => Boolean(trim(env[name]))),
    healthOnly: !hasBackendDatabase,
    checkOnly: argv.includes("--check"),
  };
}

export function backendDevEnv(config, env = process.env) {
  return {
    ...env,
    PORT: String(config.backendPort),
    [corsEnvName]: config.corsAllowedOrigins,
  };
}

export function frontendDevEnv(config, env = process.env) {
  return {
    ...env,
    PORT: String(config.frontendPort),
    [frontendPlatformEnv.mode]: "platform",
    [frontendPlatformEnv.chatMode]: "platform",
    [frontendPlatformEnv.baseUrl]: config.backendOrigin,
  };
}

export function formatLocalPlatformDevSummary(config) {
  const mode = config.healthOnly
    ? "health-only backend mode; /v1/health works, data routes need Supabase env"
    : "database-backed backend mode";
  const auth = config.serviceAuthConfigured
    ? "service-token auth configured"
    : config.jwtAuthConfigured
      ? "JWT/JWKS auth configured"
      : "no backend auth configured";

  return [
    `Frontend origin: ${config.frontendOrigin}`,
    `Backend origin: ${config.backendOrigin}`,
    `Backend CORS origins: ${config.corsAllowedOrigins}`,
    `Backend mode: ${mode}`,
    `Auth mode: ${auth}`,
  ].join("\n");
}

export function formatLocalPlatformDevErrors(config) {
  return [
    "Local modular platform dev config is not ready:",
    ...config.errors.map((error) => `- ${error}`),
    "",
    "Minimum database-backed backend env:",
    ...supabaseEnvNames.map((name) => `- ${name}`),
    "",
    "Optional backend auth: set RESERVATION_PLATFORM_SERVICE_API_KEY or complete the JWT/JWKS env trio.",
    "JWT/JWKS optional settings require the trio too: RESERVATION_PLATFORM_AUTH_ALGORITHMS, clock tolerance, JWKS cache TTL, or claim-name overrides.",
  ].join("\n");
}

function readPort(value, fallback, label, errors) {
  const raw = trim(value);
  if (!raw) {
    return fallback;
  }
  if (!/^[1-9]\d*$/u.test(raw)) {
    errors.push(`${label} must be a positive integer.`);
    return fallback;
  }
  const port = Number(raw);
  if (!Number.isSafeInteger(port) || port > 65535) {
    errors.push(`${label} must be between 1 and 65535.`);
    return fallback;
  }
  return port;
}

function configuredNames(env, names) {
  return names.filter((name) => Boolean(trim(env[name])));
}

function trim(value) {
  return typeof value === "string" ? value.trim() : "";
}
