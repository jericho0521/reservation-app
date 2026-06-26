import assert from "node:assert/strict";
import test from "node:test";

import {
  readStandaloneApiDeploymentConfig,
  standaloneApiAiChatEnvNames,
  standaloneApiRuntimeEnvNames,
  verifyStandaloneDeploymentManifest,
  verifyStandaloneRuntimeEnvNameContract,
} from "./verify-standalone-api-deployment-config.mjs";

function validDeploymentEnv(overrides = {}) {
  return {
    PORT: "4100",
    RESERVATION_SUPABASE_URL: "https://reservation-platform.supabase.co",
    RESERVATION_SUPABASE_ANON_KEY: "anon-key",
    RESERVATION_SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    RESERVATION_PLATFORM_SERVICE_API_KEY: "platform-service-token",
    RESERVATION_PLATFORM_AUTH_JWKS_URL: "https://issuer.example.test/.well-known/jwks.json",
    RESERVATION_PLATFORM_AUTH_ISSUER: "https://issuer.example.test",
    RESERVATION_PLATFORM_AUTH_AUDIENCE: "reservation-api, external-frontend",
    RESERVATION_PLATFORM_AUTH_ALGORITHMS: "RS256",
    RESERVATION_PLATFORM_AUTH_CLOCK_TOLERANCE_SECONDS: "5",
    RESERVATION_PLATFORM_AUTH_JWKS_CACHE_TTL_SECONDS: "300",
    OPENROUTER_API_KEY: "openrouter-token",
    OPENROUTER_CHAT_MODEL: "openrouter/model",
    ...overrides,
  };
}

function runtimeSourceForEnvNames(names) {
  return names.map((name) => `env.${name};`).join("\n");
}

function validDeploymentManifest(overrides = {}) {
  return {
    service: "reservation-platform-standalone-api",
    packageName: "@reservation-platform/standalone-api-skeleton",
    runtime: "node",
    buildCommand: "corepack pnpm --filter @reservation-platform/standalone-api-skeleton run build",
    startCommand: "node apps/api/dist/server.js",
    healthPath: "/v1/health",
    portEnv: "PORT",
    requiredSupabaseEnv: [
      "RESERVATION_SUPABASE_URL",
      "RESERVATION_SUPABASE_ANON_KEY",
      "RESERVATION_SUPABASE_SERVICE_ROLE_KEY",
    ],
    authEnvAlternatives: [
      ["RESERVATION_PLATFORM_SERVICE_API_KEY"],
      [
        "RESERVATION_PLATFORM_AUTH_JWKS_URL",
        "RESERVATION_PLATFORM_AUTH_ISSUER",
        "RESERVATION_PLATFORM_AUTH_AUDIENCE",
      ],
    ],
    optionalRuntimeEnv: [
      "RESERVATION_PLATFORM_AUTH_ALGORITHMS",
      "RESERVATION_PLATFORM_AUTH_CLOCK_TOLERANCE_SECONDS",
      "RESERVATION_PLATFORM_AUTH_JWKS_CACHE_TTL_SECONDS",
      "RESERVATION_PLATFORM_AUTH_SUBJECT_CLAIM",
      "RESERVATION_PLATFORM_AUTH_TENANT_IDS_CLAIM",
      "RESERVATION_PLATFORM_AUTH_VENUE_IDS_CLAIM",
      "RESERVATION_PLATFORM_AUTH_ROLES_CLAIM",
      "RESERVATION_PLATFORM_AUTH_SCOPES_CLAIM",
      "RESERVATION_PLATFORM_CORS_ALLOWED_ORIGINS",
      "GOOGLE_GENERATIVE_AI_API_KEY",
      "GOOGLE_GENERATIVE_AI_MODEL",
      "OPENROUTER_API_KEY",
      "OPENROUTER_CHAT_MODEL",
    ],
    forbiddenPublicEnvPrefixes: [
      "NEXT_PUBLIC_RESERVATION_SUPABASE",
      "NEXT_PUBLIC_RESERVATION_PLATFORM_SERVICE_API_KEY",
      "NEXT_PUBLIC_RESERVATION_PLATFORM_AUTH_",
      "NEXT_PUBLIC_OPENROUTER",
      "NEXT_PUBLIC_GOOGLE_GENERATIVE_AI",
      "NEXT_PUBLIC_GEMINI",
    ],
    ...overrides,
  };
}

test("standalone deployment manifest accepts the committed API deployment contract", () => {
  const result = verifyStandaloneDeploymentManifest();

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.manifest.healthPath, "/v1/health");
});

test("standalone deployment manifest rejects package-name drift", () => {
  const result = verifyStandaloneDeploymentManifest({
    manifest: validDeploymentManifest({ packageName: "@wrong/package" }),
    packageJson: { name: "@reservation-platform/standalone-api-skeleton" },
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /packageName must match/);
});

test("standalone deployment manifest rejects shell control operators in commands", () => {
  const result = verifyStandaloneDeploymentManifest({
    manifest: validDeploymentManifest({
      buildCommand: "corepack pnpm --filter @reservation-platform/standalone-api-skeleton run build && echo leaked",
    }),
    packageJson: { name: "@reservation-platform/standalone-api-skeleton" },
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /buildCommand must not use shell control operators/);
});

test("standalone deployment manifest rejects env-list drift", () => {
  const result = verifyStandaloneDeploymentManifest({
    manifest: validDeploymentManifest({
      requiredSupabaseEnv: ["RESERVATION_SUPABASE_URL"],
      authEnvAlternatives: [["RESERVATION_PLATFORM_SERVICE_API_KEY"]],
    }),
    packageJson: { name: "@reservation-platform/standalone-api-skeleton" },
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /requiredSupabaseEnv must equal/);
  assert.match(result.errors.join(" "), /authEnvAlternatives must list/);
});

test("standalone runtime and deployment verifier env-name contract currently matches", () => {
  const contract = verifyStandaloneRuntimeEnvNameContract();

  assert.equal(contract.ok, true);
  assert.deepEqual(contract.errors, []);
  assert.deepEqual(contract.runtimeMissingFromVerifier, []);
  assert.deepEqual(contract.verifierMissingFromRuntime, []);
});

test("standalone runtime env-name contract fails when runtime adds an env unknown to verifier", () => {
  const contract = verifyStandaloneRuntimeEnvNameContract({
    runtimeSource: [
      runtimeSourceForEnvNames(standaloneApiRuntimeEnvNames),
      "env.RESERVATION_PLATFORM_AUTH_REQUIRED_EXTRA_CLAIM;",
    ].join("\n"),
  });

  assert.equal(contract.ok, false);
  assert.deepEqual(contract.runtimeMissingFromVerifier, [
    "RESERVATION_PLATFORM_AUTH_REQUIRED_EXTRA_CLAIM",
  ]);
  assert.match(contract.errors.join(" "), /missing from the deployment verifier/);
});

test("standalone runtime env-name contract fails when verifier requires runtime env absent from runtime", () => {
  const contract = verifyStandaloneRuntimeEnvNameContract({
    runtimeSource: runtimeSourceForEnvNames(standaloneApiRuntimeEnvNames),
    verifierRuntimeEnvNames: [
      ...standaloneApiRuntimeEnvNames,
      "RESERVATION_PLATFORM_AUTH_REQUIRED_EXTRA_CLAIM",
    ],
  });

  assert.equal(contract.ok, false);
  assert.deepEqual(contract.verifierMissingFromRuntime, [
    "RESERVATION_PLATFORM_AUTH_REQUIRED_EXTRA_CLAIM",
  ]);
  assert.match(contract.errors.join(" "), /absent from apps\/api\/src\/runtime\.ts/);
});

test("standalone runtime env-name contract ignores env names that are not read from env", () => {
  const contract = verifyStandaloneRuntimeEnvNameContract({
    runtimeSource: `
      export const STANDALONE_SUPABASE_ENV_NAMES = {
        url: "RESERVATION_SUPABASE_URL",
        serviceApiKey: "RESERVATION_PLATFORM_SERVICE_API_KEY",
      } as const;

      export interface StandaloneSupabaseEnv {
        RESERVATION_SUPABASE_URL?: string;
        RESERVATION_PLATFORM_SERVICE_API_KEY?: string;
      }

      // env.RESERVATION_PLATFORM_SERVICE_API_KEY is documented here but not read.
      const docs = "env.RESERVATION_PLATFORM_AUTH_ISSUER";

      export function fromEnv(env) {
        return {
          supabaseUrl: env.RESERVATION_SUPABASE_URL,
        };
      }
    `,
    verifierRuntimeEnvNames: [
      "RESERVATION_SUPABASE_URL",
      "RESERVATION_PLATFORM_SERVICE_API_KEY",
      "RESERVATION_PLATFORM_AUTH_ISSUER",
    ],
  });

  assert.equal(contract.ok, false);
  assert.deepEqual(contract.runtimeEnvNames, ["RESERVATION_SUPABASE_URL"]);
  assert.deepEqual(contract.verifierMissingFromRuntime, [
    "RESERVATION_PLATFORM_AUTH_ISSUER",
    "RESERVATION_PLATFORM_SERVICE_API_KEY",
  ]);
  assert.match(contract.errors.join(" "), /absent from apps\/api\/src\/runtime\.ts/);
});

test("standalone runtime env-name contract allows AI chat env as verifier-only readiness names", () => {
  const contract = verifyStandaloneRuntimeEnvNameContract({
    runtimeSource: runtimeSourceForEnvNames(standaloneApiRuntimeEnvNames),
    deploymentReadinessOnlyEnvNames: standaloneApiAiChatEnvNames,
  });

  assert.equal(contract.ok, true);
  assert.deepEqual(contract.errors, []);
  assert.deepEqual(contract.deploymentReadinessOnlyEnvNames, standaloneApiAiChatEnvNames);
});

test("standalone API deployment config safely skips when env is absent", () => {
  const parsed = readStandaloneApiDeploymentConfig({}, { argv: [] });

  assert.equal(parsed.status, "skip");
  assert.equal(parsed.shouldSkip, true);
  assert.equal(parsed.shouldFail, false);
  assert.equal(parsed.ready, false);
  assert.equal(parsed.config, null);
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.missing, []);
  assert.match(parsed.message, /required standalone API deployment config is incomplete/);
});

test("standalone API deployment config fails strict runs when required env is missing", () => {
  const parsed = readStandaloneApiDeploymentConfig({}, { argv: ["--strict"] });

  assert.equal(parsed.status, "fail");
  assert.equal(parsed.strict, true);
  assert.equal(parsed.shouldFail, true);
  assert.equal(parsed.ready, false);
  assert.deepEqual(parsed.missing, [
    "RESERVATION_SUPABASE_URL",
    "RESERVATION_SUPABASE_ANON_KEY",
    "RESERVATION_SUPABASE_SERVICE_ROLE_KEY",
    "RESERVATION_PLATFORM_SERVICE_API_KEY or RESERVATION_PLATFORM_AUTH_JWKS_URL/ISSUER/AUDIENCE",
  ]);
});

test("standalone API deployment config accepts complete backend-only env", () => {
  const parsed = readStandaloneApiDeploymentConfig(validDeploymentEnv(), { argv: ["--strict"] });

  assert.equal(parsed.status, "ready");
  assert.equal(parsed.strict, true);
  assert.equal(parsed.ready, true);
  assert.equal(parsed.supabaseReady, true);
  assert.equal(parsed.authReady, true);
  assert.equal(parsed.serviceTokenReady, true);
  assert.equal(parsed.jwtReady, true);
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.config.supabase, {
    url: "https://reservation-platform.supabase.co/",
    anonKey: "anon-key",
    serviceRoleKey: "service-role-key",
  });
  assert.deepEqual(parsed.config.auth.audience, ["reservation-api", "external-frontend"]);
  assert.deepEqual(parsed.config.aiChat.configuredEnvNames, ["OPENROUTER_API_KEY", "OPENROUTER_CHAT_MODEL"]);
});

test("standalone API deployment config rejects partial Supabase config in strict mode", () => {
  const parsed = readStandaloneApiDeploymentConfig(
    validDeploymentEnv({
      RESERVATION_SUPABASE_ANON_KEY: undefined,
    }),
    { argv: ["--strict"] },
  );

  assert.equal(parsed.status, "fail");
  assert.equal(parsed.ready, false);
  assert.match(parsed.message, /Supabase config must be complete-or-absent/);
  assert.match(parsed.message, /RESERVATION_SUPABASE_ANON_KEY/);
});

test("standalone API deployment config rejects malformed URL and PORT", () => {
  const parsed = readStandaloneApiDeploymentConfig(
    validDeploymentEnv({
      PORT: "0",
      RESERVATION_SUPABASE_URL: "not-a-url",
    }),
    { argv: ["--strict"] },
  );

  assert.equal(parsed.status, "fail");
  assert.equal(parsed.ready, false);
  assert.match(parsed.message, /PORT must be a positive integer/);
  assert.match(parsed.message, /RESERVATION_SUPABASE_URL must be an absolute URL/);
});

test("standalone API deployment config rejects partial JWT/JWKS config", () => {
  const parsed = readStandaloneApiDeploymentConfig(
    validDeploymentEnv({
      RESERVATION_PLATFORM_AUTH_ISSUER: undefined,
      RESERVATION_PLATFORM_AUTH_AUDIENCE: undefined,
    }),
    { argv: ["--strict"] },
  );

  assert.equal(parsed.status, "fail");
  assert.equal(parsed.ready, false);
  assert.match(parsed.message, /JWT\/JWKS auth config must be complete-or-absent/);
  assert.match(parsed.message, /RESERVATION_PLATFORM_AUTH_ISSUER/);
  assert.match(parsed.message, /RESERVATION_PLATFORM_AUTH_AUDIENCE/);
});

test("standalone API deployment config rejects invalid numeric auth settings", () => {
  const parsed = readStandaloneApiDeploymentConfig(
    validDeploymentEnv({
      RESERVATION_PLATFORM_AUTH_CLOCK_TOLERANCE_SECONDS: "-1",
      RESERVATION_PLATFORM_AUTH_JWKS_CACHE_TTL_SECONDS: "-1",
    }),
    { argv: ["--strict"] },
  );

  assert.equal(parsed.status, "fail");
  assert.equal(parsed.ready, false);
  assert.match(parsed.message, /CLOCK_TOLERANCE_SECONDS must be an integer/);
  assert.match(parsed.message, /JWKS_CACHE_TTL_SECONDS must be an integer/);
});

test("standalone API deployment config allows zero JWKS cache TTL like runtime", () => {
  const parsed = readStandaloneApiDeploymentConfig(
    validDeploymentEnv({
      RESERVATION_PLATFORM_AUTH_JWKS_CACHE_TTL_SECONDS: "0",
    }),
    { argv: ["--strict"] },
  );

  assert.equal(parsed.status, "ready");
  assert.equal(parsed.ready, true);
  assert.equal(parsed.config.auth.jwksCacheTtlSeconds, 0);
});

test("standalone API deployment config rejects blank service token when set", () => {
  const parsed = readStandaloneApiDeploymentConfig(
    validDeploymentEnv({
      RESERVATION_PLATFORM_SERVICE_API_KEY: "   ",
      RESERVATION_PLATFORM_AUTH_JWKS_URL: undefined,
      RESERVATION_PLATFORM_AUTH_ISSUER: undefined,
      RESERVATION_PLATFORM_AUTH_AUDIENCE: undefined,
      RESERVATION_PLATFORM_AUTH_ALGORITHMS: undefined,
      RESERVATION_PLATFORM_AUTH_CLOCK_TOLERANCE_SECONDS: undefined,
      RESERVATION_PLATFORM_AUTH_JWKS_CACHE_TTL_SECONDS: undefined,
    }),
    { argv: ["--strict"] },
  );

  assert.equal(parsed.status, "fail");
  assert.equal(parsed.ready, false);
  assert.match(parsed.message, /RESERVATION_PLATFORM_SERVICE_API_KEY must not be blank when set/);
});

test("standalone API deployment config rejects NEXT_PUBLIC backend secret-style env", () => {
  const parsed = readStandaloneApiDeploymentConfig(
    validDeploymentEnv({
      NEXT_PUBLIC_ANALYTICS_API_KEY: "public-analytics-token",
      NEXT_PUBLIC_RESERVATION_PLATFORM_SERVICE_API_KEY: "do-not-expose",
      NEXT_PUBLIC_RESERVATION_SUPABASE_SERVICE_ROLE_KEY: "do-not-expose",
      NEXT_PUBLIC_OPENROUTER_API_KEY: "do-not-expose",
    }),
    { argv: ["--strict"] },
  );

  assert.equal(parsed.status, "fail");
  assert.equal(parsed.ready, false);
  assert.deepEqual(parsed.nextPublicBackendSecrets, [
    "NEXT_PUBLIC_OPENROUTER_API_KEY",
    "NEXT_PUBLIC_RESERVATION_PLATFORM_SERVICE_API_KEY",
    "NEXT_PUBLIC_RESERVATION_SUPABASE_SERVICE_ROLE_KEY",
  ]);
  assert.match(parsed.message, /must not use NEXT_PUBLIC_\* names/);
});
