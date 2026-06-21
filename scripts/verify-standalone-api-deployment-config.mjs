#!/usr/bin/env node

import { pathToFileURL } from "node:url";

export const standaloneApiDeploymentStrictEnvName = "RESERVATION_STANDALONE_API_DEPLOYMENT_CONFIG_STRICT";

export const standaloneApiSupabaseEnvNames = [
  "RESERVATION_SUPABASE_URL",
  "RESERVATION_SUPABASE_ANON_KEY",
  "RESERVATION_SUPABASE_SERVICE_ROLE_KEY",
];

export const standaloneApiAuthRequiredEnvNames = [
  "RESERVATION_PLATFORM_AUTH_JWKS_URL",
  "RESERVATION_PLATFORM_AUTH_ISSUER",
  "RESERVATION_PLATFORM_AUTH_AUDIENCE",
];

export const standaloneApiAuthOptionalEnvNames = [
  "RESERVATION_PLATFORM_AUTH_ALGORITHMS",
  "RESERVATION_PLATFORM_AUTH_CLOCK_TOLERANCE_SECONDS",
  "RESERVATION_PLATFORM_AUTH_JWKS_CACHE_TTL_SECONDS",
  "RESERVATION_PLATFORM_AUTH_SUBJECT_CLAIM",
  "RESERVATION_PLATFORM_AUTH_TENANT_IDS_CLAIM",
  "RESERVATION_PLATFORM_AUTH_VENUE_IDS_CLAIM",
  "RESERVATION_PLATFORM_AUTH_ROLES_CLAIM",
  "RESERVATION_PLATFORM_AUTH_SCOPES_CLAIM",
];

export const standaloneApiAiChatEnvNames = [
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "GOOGLE_GENERATIVE_AI_MODEL",
  "OPENROUTER_API_KEY",
  "OPENROUTER_CHAT_MODEL",
];

const standaloneApiKnownEnvNames = [
  "PORT",
  ...standaloneApiSupabaseEnvNames,
  "RESERVATION_PLATFORM_SERVICE_API_KEY",
  ...standaloneApiAuthRequiredEnvNames,
  ...standaloneApiAuthOptionalEnvNames,
  ...standaloneApiAiChatEnvNames,
  standaloneApiDeploymentStrictEnvName,
];

const nextPublicBackendSecretPattern =
  /^NEXT_PUBLIC_(?:RESERVATION_SUPABASE(?:_|$)|RESERVATION_PLATFORM_SERVICE_API_KEY$|RESERVATION_PLATFORM_AUTH_|.*(?:SERVICE_ROLE|OPENROUTER|GOOGLE_GENERATIVE_AI|GEMINI).*)/u;

function trimEnvValue(env, name) {
  return typeof env[name] === "string" ? env[name].trim() : "";
}

function hasEnvValue(env, name) {
  return Object.prototype.hasOwnProperty.call(env, name) && env[name] !== undefined;
}

function nonBlankConfiguredEnvNames(env, names) {
  return names.filter((name) => trimEnvValue(env, name).length > 0);
}

function validateNonBlankWhenSet(env, names, errors) {
  for (const name of names) {
    if (hasEnvValue(env, name) && trimEnvValue(env, name).length === 0) {
      errors.push(`${name} must not be blank when set.`);
    }
  }
}

function validateHttpUrl(value, name, errors) {
  if (!value) {
    return "";
  }

  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) {
      errors.push(`${name} must use http or https.`);
    }
    return url.toString();
  } catch {
    errors.push(`${name} must be an absolute URL.`);
    return value;
  }
}

function validatePositivePort(value, errors) {
  if (!value) {
    return "";
  }

  if (!/^[1-9]\d*$/u.test(value)) {
    errors.push("PORT must be a positive integer when set.");
    return value;
  }

  const port = Number(value);
  if (!Number.isSafeInteger(port) || port > 65535) {
    errors.push("PORT must be between 1 and 65535 when set.");
  }
  return String(port);
}

function validateIntegerEnv(value, name, errors, options) {
  if (!value) {
    return undefined;
  }

  if (!/^(?:0|[1-9]\d*)$/u.test(value)) {
    errors.push(`${name} must be an integer when set.`);
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < options.min) {
    errors.push(`${name} must be ${options.description} when set.`);
    return undefined;
  }
  return parsed;
}

function splitEnvList(value) {
  return Array.from(new Set(
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  ));
}

function findNextPublicBackendSecrets(env) {
  return Object.keys(env)
    .filter((name) => nextPublicBackendSecretPattern.test(name))
    .filter((name) => trimEnvValue(env, name).length > 0)
    .sort((left, right) => left.localeCompare(right, "en"));
}

function buildConfig(values, auth, aiChat) {
  return {
    port: values.PORT ? Number(values.PORT) : undefined,
    supabase: {
      url: values.RESERVATION_SUPABASE_URL,
      anonKey: values.RESERVATION_SUPABASE_ANON_KEY,
      serviceRoleKey: values.RESERVATION_SUPABASE_SERVICE_ROLE_KEY,
    },
    auth,
    aiChat,
  };
}

export function readStandaloneApiDeploymentConfig(env, options = {}) {
  const argv = options.argv ?? [];
  const strict =
    argv.includes("--strict") ||
    trimEnvValue(env, standaloneApiDeploymentStrictEnvName) === "1";
  const errors = [];
  const values = {};

  for (const name of standaloneApiKnownEnvNames) {
    values[name] = trimEnvValue(env, name);
  }

  values.PORT = validatePositivePort(values.PORT, errors);
  values.RESERVATION_SUPABASE_URL = validateHttpUrl(
    values.RESERVATION_SUPABASE_URL,
    "RESERVATION_SUPABASE_URL",
    errors,
  );
  values.RESERVATION_PLATFORM_AUTH_JWKS_URL = validateHttpUrl(
    values.RESERVATION_PLATFORM_AUTH_JWKS_URL,
    "RESERVATION_PLATFORM_AUTH_JWKS_URL",
    errors,
  );

  validateNonBlankWhenSet(env, [
    "PORT",
    ...standaloneApiSupabaseEnvNames,
    "RESERVATION_PLATFORM_SERVICE_API_KEY",
    ...standaloneApiAuthRequiredEnvNames,
    ...standaloneApiAuthOptionalEnvNames,
    ...standaloneApiAiChatEnvNames,
  ], errors);

  const supabaseConfigured = nonBlankConfiguredEnvNames(env, standaloneApiSupabaseEnvNames);
  const supabaseMissing = supabaseConfigured.length > 0 || strict
    ? standaloneApiSupabaseEnvNames.filter((name) => values[name].length === 0)
    : [];
  if (supabaseConfigured.length > 0 && supabaseMissing.length > 0) {
    errors.push(
      `Standalone Supabase config must be complete-or-absent: missing ${supabaseMissing.join(", ")}.`,
    );
  }

  const authConfigured = nonBlankConfiguredEnvNames(env, [
    ...standaloneApiAuthRequiredEnvNames,
    ...standaloneApiAuthOptionalEnvNames,
  ]);
  const authMissing = authConfigured.length > 0
    ? standaloneApiAuthRequiredEnvNames.filter((name) => values[name].length === 0)
    : [];
  if (authMissing.length > 0) {
    errors.push(`Standalone JWT/JWKS auth config must be complete-or-absent: missing ${authMissing.join(", ")}.`);
  }

  const authAudience = splitEnvList(values.RESERVATION_PLATFORM_AUTH_AUDIENCE);
  if (values.RESERVATION_PLATFORM_AUTH_AUDIENCE && authAudience.length === 0) {
    errors.push("RESERVATION_PLATFORM_AUTH_AUDIENCE must include at least one audience when set.");
  }

  const authAlgorithms = values.RESERVATION_PLATFORM_AUTH_ALGORITHMS
    ? splitEnvList(values.RESERVATION_PLATFORM_AUTH_ALGORITHMS)
    : [];
  if (values.RESERVATION_PLATFORM_AUTH_ALGORITHMS && authAlgorithms.length === 0) {
    errors.push("RESERVATION_PLATFORM_AUTH_ALGORITHMS must include at least one algorithm when set.");
  }

  const clockToleranceSeconds = validateIntegerEnv(
    values.RESERVATION_PLATFORM_AUTH_CLOCK_TOLERANCE_SECONDS,
    "RESERVATION_PLATFORM_AUTH_CLOCK_TOLERANCE_SECONDS",
    errors,
    { min: 0, description: "a non-negative integer" },
  );
  const jwksCacheTtlSeconds = validateIntegerEnv(
    values.RESERVATION_PLATFORM_AUTH_JWKS_CACHE_TTL_SECONDS,
    "RESERVATION_PLATFORM_AUTH_JWKS_CACHE_TTL_SECONDS",
    errors,
    { min: 0, description: "a non-negative integer" },
  );

  const nextPublicBackendSecrets = findNextPublicBackendSecrets(env);
  if (nextPublicBackendSecrets.length > 0) {
    errors.push(
      `Standalone backend secrets/config must not use NEXT_PUBLIC_* names: ${nextPublicBackendSecrets.join(", ")}.`,
    );
  }

  const supabaseReady = standaloneApiSupabaseEnvNames.every((name) => values[name].length > 0);
  const serviceTokenReady = values.RESERVATION_PLATFORM_SERVICE_API_KEY.length > 0;
  const jwtReady = standaloneApiAuthRequiredEnvNames.every((name) => values[name].length > 0);
  const authReady = serviceTokenReady || jwtReady;
  const aiChatConfigured = nonBlankConfiguredEnvNames(env, standaloneApiAiChatEnvNames);
  const configured = standaloneApiKnownEnvNames
    .filter((name) => name !== standaloneApiDeploymentStrictEnvName)
    .filter((name) => hasEnvValue(env, name) && trimEnvValue(env, name).length > 0);
  const requiredMissing = [
    ...supabaseMissing,
    ...(strict && !authReady ? ["RESERVATION_PLATFORM_SERVICE_API_KEY or RESERVATION_PLATFORM_AUTH_JWKS_URL/ISSUER/AUDIENCE"] : []),
  ];
  const ready = errors.length === 0 && supabaseReady && authReady;
  let status = "ready";
  let message = "";

  if (errors.length > 0) {
    status = strict ? "fail" : "skip";
    message = errors.join(" ");
  } else if (!ready) {
    const details = [
      requiredMissing.length > 0 ? `missing ${requiredMissing.join(", ")}` : "missing standalone backend deployment config",
      configured.length > 0 ? `configured ${configured.join(", ")}` : "no standalone backend deployment env configured",
    ].join("; ");
    status = strict ? "fail" : "skip";
    message = `required standalone API deployment config is incomplete: ${details}.`;
  }

  const auth = {
    serviceApiKeyConfigured: serviceTokenReady,
    jwtJwksConfigured: jwtReady,
    ...(jwtReady ? {
      jwksUrl: values.RESERVATION_PLATFORM_AUTH_JWKS_URL,
      issuer: values.RESERVATION_PLATFORM_AUTH_ISSUER,
      audience: authAudience,
      algorithms: authAlgorithms,
      clockToleranceSeconds,
      jwksCacheTtlSeconds,
    } : {}),
  };
  const aiChat = {
    configuredEnvNames: aiChatConfigured,
  };

  return {
    values,
    config: ready ? buildConfig(values, auth, aiChat) : null,
    configured,
    missing: requiredMissing,
    errors,
    strict,
    supabaseReady,
    authReady,
    serviceTokenReady,
    jwtReady,
    aiChatConfigured,
    nextPublicBackendSecrets,
    ready,
    status,
    shouldSkip: status === "skip",
    shouldFail: status === "fail",
    message,
  };
}

function fail(message) {
  console.error(`FAILED standalone API deployment config: ${message}`);
  process.exitCode = 1;
}

function skip(message) {
  console.log(`SKIPPED standalone API deployment config: ${message}`);
}

function main() {
  const parsed = readStandaloneApiDeploymentConfig(process.env, { argv: process.argv.slice(2) });
  console.log("Standalone API deployment config env contract checked.");

  if (parsed.shouldFail) {
    fail(parsed.message);
    return;
  }
  if (parsed.shouldSkip) {
    skip(`${parsed.message} No network, deployment, or live backend call was attempted.`);
    return;
  }

  console.log("PASS standalone API deployment config is complete. No network, deployment, or live backend call was attempted.");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
