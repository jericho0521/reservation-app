import assert from "node:assert/strict";
import test from "node:test";

import { readStandaloneApiDeploymentConfig } from "./verify-standalone-api-deployment-config.mjs";

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
      NEXT_PUBLIC_RESERVATION_SUPABASE_SERVICE_ROLE_KEY: "do-not-expose",
      NEXT_PUBLIC_OPENROUTER_API_KEY: "do-not-expose",
    }),
    { argv: ["--strict"] },
  );

  assert.equal(parsed.status, "fail");
  assert.equal(parsed.ready, false);
  assert.deepEqual(parsed.nextPublicBackendSecrets, [
    "NEXT_PUBLIC_OPENROUTER_API_KEY",
    "NEXT_PUBLIC_RESERVATION_SUPABASE_SERVICE_ROLE_KEY",
  ]);
  assert.match(parsed.message, /must not use NEXT_PUBLIC_\* names/);
});
