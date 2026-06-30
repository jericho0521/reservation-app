#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const standaloneApiDeploymentStrictEnvName = "RESERVATION_STANDALONE_API_DEPLOYMENT_CONFIG_STRICT";
export const standaloneApiServiceAuthEnvName = "RESERVATION_PLATFORM_SERVICE_API_KEY";

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

export const standaloneApiCorsOptionalEnvNames = [
  "RESERVATION_PLATFORM_CORS_ALLOWED_ORIGINS",
];

export const standaloneApiWhatsAppEnvNames = [
  "RESERVATION_WHATSAPP_ENABLED",
  "RESERVATION_WHATSAPP_PROVIDER",
  "RESERVATION_WHATSAPP_SESSION_AUTH_DIR",
  "RESERVATION_WHATSAPP_SESSION_ENCRYPTION_KEY",
  "RESERVATION_WHATSAPP_ALLOW_MEMORY_STORE",
  "RESERVATION_WHATSAPP_SIMULATION_ENABLED",
];

export const standaloneApiAiChatEnvNames = [
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "GOOGLE_GENERATIVE_AI_MODEL",
  "OPENROUTER_API_KEY",
  "OPENROUTER_CHAT_MODEL",
];

export const standaloneApiAiAgentEnvNames = [
  "AI_AGENT_PROVIDER",
  "AI_AGENT_BASE_URL",
  "AI_AGENT_API_KEY",
  "AI_AGENT_MODEL",
];

export const standaloneApiRuntimeEnvNames = [
  ...standaloneApiSupabaseEnvNames,
  standaloneApiServiceAuthEnvName,
  ...standaloneApiAuthRequiredEnvNames,
  ...standaloneApiAuthOptionalEnvNames,
  ...standaloneApiCorsOptionalEnvNames,
  ...standaloneApiWhatsAppEnvNames,
];

export const standaloneApiDeploymentReadinessOnlyEnvNames = [
  "PORT",
  ...standaloneApiAiChatEnvNames,
  ...standaloneApiAiAgentEnvNames,
  standaloneApiDeploymentStrictEnvName,
];

const standaloneApiKnownEnvNames = [
  ...standaloneApiRuntimeEnvNames,
  ...standaloneApiDeploymentReadinessOnlyEnvNames,
];

const runtimeEnvMemberAccessPattern =
  /(?<![\w$])env\s*\??\.\s*(RESERVATION_SUPABASE_[A-Z0-9_]+|RESERVATION_PLATFORM_SERVICE_API_KEY|RESERVATION_PLATFORM_AUTH_[A-Z0-9_]+|RESERVATION_PLATFORM_CORS_ALLOWED_ORIGINS|RESERVATION_WHATSAPP_[A-Z0-9_]+|AI_AGENT_[A-Z0-9_]+)\b/gu;

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const defaultRuntimeSourcePath = resolve(scriptDirectory, "../apps/api/src/runtime.ts");
const defaultDeploymentManifestPath = resolve(scriptDirectory, "../apps/api/deployment.config.json");
const defaultStandaloneApiPackageJsonPath = resolve(scriptDirectory, "../apps/api/package.json");

const nextPublicBackendSecretPattern =
  /^NEXT_PUBLIC_(?:RESERVATION_SUPABASE(?:_|$)|RESERVATION_PLATFORM_SERVICE_API_KEY$|RESERVATION_PLATFORM_AUTH_|AI_AGENT|.*(?:SERVICE_ROLE|OPENROUTER|GOOGLE_GENERATIVE_AI|GEMINI).*)/u;

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

function sortedUnique(values) {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right, "en"));
}

function stripCommentsAndStringLiterals(source) {
  let stripped = "";
  let index = 0;

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (char === "/" && next === "/") {
      stripped += "  ";
      index += 2;
      while (index < source.length && source[index] !== "\n") {
        stripped += " ";
        index += 1;
      }
      continue;
    }

    if (char === "/" && next === "*") {
      stripped += "  ";
      index += 2;
      while (index < source.length) {
        const blockChar = source[index];
        if (blockChar === "*" && source[index + 1] === "/") {
          stripped += "  ";
          index += 2;
          break;
        }
        stripped += blockChar === "\n" ? "\n" : " ";
        index += 1;
      }
      continue;
    }

    if (char === "\"" || char === "'" || char === "`") {
      const quote = char;
      stripped += " ";
      index += 1;
      while (index < source.length) {
        const stringChar = source[index];
        if (stringChar === "\\") {
          stripped += source[index + 1] === "\n" ? " \n" : "  ";
          index += 2;
          continue;
        }
        stripped += stringChar === "\n" ? "\n" : " ";
        index += 1;
        if (stringChar === quote) {
          break;
        }
      }
      continue;
    }

    stripped += char;
    index += 1;
  }

  return stripped;
}

function extractRuntimeEnvNamesFromSource(source) {
  const codeOnlySource = stripCommentsAndStringLiterals(source);
  const runtimeEnvNames = Array.from(
    codeOnlySource.matchAll(runtimeEnvMemberAccessPattern),
    (match) => match[1],
  );
  return sortedUnique(runtimeEnvNames);
}

function readJsonFile(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function asStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : null;
}

function arraysEqual(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function validateCommand(value, name, errors) {
  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push(`Standalone deployment manifest ${name} must be a non-empty string.`);
    return;
  }

  if (/[;&|`]/u.test(value)) {
    errors.push(`Standalone deployment manifest ${name} must not use shell control operators.`);
  }
}

function validateEnvList(value, name, expected, errors) {
  const list = asStringArray(value);
  if (!list) {
    errors.push(`Standalone deployment manifest ${name} must be a string array.`);
    return;
  }

  if (!arraysEqual(list, expected)) {
    errors.push(`Standalone deployment manifest ${name} must equal ${expected.join(", ")}.`);
  }
}

export function verifyStandaloneDeploymentManifest(options = {}) {
  const manifest = options.manifest ?? readJsonFile(options.manifestPath ?? defaultDeploymentManifestPath);
  const packageJson = options.packageJson ?? readJsonFile(options.packageJsonPath ?? defaultStandaloneApiPackageJsonPath);
  const errors = [];

  if (manifest.service !== "reservation-platform-standalone-api") {
    errors.push("Standalone deployment manifest service must be reservation-platform-standalone-api.");
  }
  if (manifest.packageName !== packageJson.name) {
    errors.push(`Standalone deployment manifest packageName must match apps/api/package.json name ${packageJson.name}.`);
  }
  if (manifest.runtime !== "node") {
    errors.push("Standalone deployment manifest runtime must be node.");
  }
  validateCommand(manifest.buildCommand, "buildCommand", errors);
  validateCommand(manifest.startCommand, "startCommand", errors);
  if (manifest.buildCommand !== "corepack pnpm --filter @reservation-platform/standalone-api-skeleton run build") {
    errors.push("Standalone deployment manifest buildCommand must build the standalone API workspace package.");
  }
  if (manifest.startCommand !== "node apps/api/dist/server.js") {
    errors.push("Standalone deployment manifest startCommand must start the built standalone API server.");
  }
  if (manifest.healthPath !== "/v1/health") {
    errors.push("Standalone deployment manifest healthPath must be /v1/health.");
  }
  if (manifest.portEnv !== "PORT") {
    errors.push("Standalone deployment manifest portEnv must be PORT.");
  }
  validateEnvList(manifest.requiredSupabaseEnv, "requiredSupabaseEnv", standaloneApiSupabaseEnvNames, errors);
  const authAlternatives = Array.isArray(manifest.authEnvAlternatives) ? manifest.authEnvAlternatives : null;
  const expectedAuthAlternatives = [
    [standaloneApiServiceAuthEnvName],
    standaloneApiAuthRequiredEnvNames,
  ];
  if (!authAlternatives || !authAlternatives.every((entry) => asStringArray(entry))) {
    errors.push("Standalone deployment manifest authEnvAlternatives must be an array of string arrays.");
  } else if (
    authAlternatives.length !== expectedAuthAlternatives.length ||
    !authAlternatives.every((entry, index) => arraysEqual(entry, expectedAuthAlternatives[index]))
  ) {
    errors.push("Standalone deployment manifest authEnvAlternatives must list service-token and JWT/JWKS auth alternatives.");
  }
  validateEnvList(
    manifest.optionalRuntimeEnv,
    "optionalRuntimeEnv",
    [
      ...standaloneApiAuthOptionalEnvNames,
      ...standaloneApiCorsOptionalEnvNames,
      ...standaloneApiAiChatEnvNames,
      ...standaloneApiAiAgentEnvNames,
      ...standaloneApiWhatsAppEnvNames,
    ],
    errors,
  );
  validateEnvList(
    manifest.forbiddenPublicEnvPrefixes,
    "forbiddenPublicEnvPrefixes",
    [
      "NEXT_PUBLIC_RESERVATION_SUPABASE",
      "NEXT_PUBLIC_RESERVATION_PLATFORM_SERVICE_API_KEY",
      "NEXT_PUBLIC_RESERVATION_PLATFORM_AUTH_",
      "NEXT_PUBLIC_AI_AGENT",
      "NEXT_PUBLIC_OPENROUTER",
      "NEXT_PUBLIC_GOOGLE_GENERATIVE_AI",
      "NEXT_PUBLIC_GEMINI",
    ],
    errors,
  );

  return {
    manifest,
    packageName: packageJson.name,
    errors,
    ok: errors.length === 0,
  };
}

export function verifyStandaloneRuntimeEnvNameContract(options = {}) {
  const runtimeSource = options.runtimeSource
    ?? readFileSync(options.runtimeSourcePath ?? defaultRuntimeSourcePath, "utf8");
  const runtimeEnvNames = options.runtimeEnvNames
    ? sortedUnique(options.runtimeEnvNames)
    : extractRuntimeEnvNamesFromSource(runtimeSource);
  const verifierRuntimeEnvNames = sortedUnique(options.verifierRuntimeEnvNames ?? standaloneApiRuntimeEnvNames);
  const deploymentReadinessOnlyEnvNames = sortedUnique(
    options.deploymentReadinessOnlyEnvNames ?? standaloneApiDeploymentReadinessOnlyEnvNames,
  );
  const verifierEnvNames = sortedUnique([
    ...verifierRuntimeEnvNames,
    ...deploymentReadinessOnlyEnvNames,
  ]);
  const runtimeEnvNameSet = new Set(runtimeEnvNames);
  const verifierRuntimeEnvNameSet = new Set(verifierRuntimeEnvNames);

  const runtimeMissingFromVerifier = runtimeEnvNames.filter((name) => !verifierRuntimeEnvNameSet.has(name));
  const verifierMissingFromRuntime = verifierRuntimeEnvNames.filter((name) => !runtimeEnvNameSet.has(name));

  const errors = [];
  if (runtimeMissingFromVerifier.length > 0) {
    errors.push(
      `Standalone runtime env names are missing from the deployment verifier: ${runtimeMissingFromVerifier.join(", ")}.`,
    );
  }
  if (verifierMissingFromRuntime.length > 0) {
    errors.push(
      `Standalone deployment verifier runtime-required env names are absent from apps/api/src/runtime.ts: ${verifierMissingFromRuntime.join(", ")}.`,
    );
  }

  return {
    runtimeEnvNames,
    verifierRuntimeEnvNames,
    deploymentReadinessOnlyEnvNames,
    verifierEnvNames,
    runtimeMissingFromVerifier,
    verifierMissingFromRuntime,
    errors,
    ok: errors.length === 0,
  };
}

export function readStandaloneApiDeploymentConfig(env, options = {}) {
  const argv = options.argv ?? [];
  const strict =
    argv.includes("--strict") ||
    trimEnvValue(env, standaloneApiDeploymentStrictEnvName) === "1";
  const runtimeEnvContract = verifyStandaloneRuntimeEnvNameContract(options.runtimeEnvContractOptions);
  const deploymentManifest = verifyStandaloneDeploymentManifest(options.deploymentManifestOptions);
  const errors = [...runtimeEnvContract.errors, ...deploymentManifest.errors];
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
    standaloneApiServiceAuthEnvName,
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
  const serviceTokenReady = values[standaloneApiServiceAuthEnvName].length > 0;
  const jwtReady = standaloneApiAuthRequiredEnvNames.every((name) => values[name].length > 0);
  const authReady = serviceTokenReady || jwtReady;
  const aiChatConfigured = nonBlankConfiguredEnvNames(env, standaloneApiAiChatEnvNames);
  const configured = standaloneApiKnownEnvNames
    .filter((name) => name !== standaloneApiDeploymentStrictEnvName)
    .filter((name) => hasEnvValue(env, name) && trimEnvValue(env, name).length > 0);
  const requiredMissing = [
    ...supabaseMissing,
    ...(strict && !authReady ? [`${standaloneApiServiceAuthEnvName} or RESERVATION_PLATFORM_AUTH_JWKS_URL/ISSUER/AUDIENCE`] : []),
  ];
  const ready = errors.length === 0 && supabaseReady && authReady;
  let status = "ready";
  let message = "";

  if (runtimeEnvContract.errors.length > 0) {
    status = "fail";
    message = runtimeEnvContract.errors.join(" ");
  } else if (errors.length > 0) {
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
    runtimeEnvContract,
    deploymentManifest,
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
