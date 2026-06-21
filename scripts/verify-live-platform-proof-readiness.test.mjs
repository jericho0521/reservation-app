import assert from "node:assert/strict";
import test from "node:test";

import {
  livePlatformProofReadinessStrictEnvName,
  readLivePlatformProofReadiness,
} from "./verify-live-platform-proof-readiness.mjs";

function validReadinessEnv(overrides = {}) {
  return {
    PORT: "4100",
    RESERVATION_SUPABASE_URL: "https://reservation-platform.supabase.co",
    RESERVATION_SUPABASE_ANON_KEY: "anon-key",
    RESERVATION_SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    RESERVATION_PLATFORM_SERVICE_API_KEY: "platform-service-token",
    RESERVATION_DATABASE_LIVE_URL: "postgres://user:pass@localhost:5432/reservation_disposable",
    RESERVATION_PLATFORM_LIVE_BASE_URL: "https://backend.example.test/platform",
    RESERVATION_PLATFORM_LIVE_TENANT_ID: "tenant_123",
    RESERVATION_PLATFORM_LIVE_API_KEY: "live-api-key",
    RESERVATION_PLATFORM_LIVE_SERVICE_ID: "svc_123",
    RESERVATION_PLATFORM_LIVE_RESOURCE_ID: "resrc_123",
    RESERVATION_PLATFORM_LIVE_START_AT: "2026-06-13T10:00:00.000Z",
    RESERVATION_PLATFORM_LIVE_END_AT: "2026-06-13T11:00:00.000Z",
    RESERVATION_PLATFORM_LIVE_ALLOW_MUTATIONS: "1",
    RESERVATION_SDK_REGISTRY_PROOF_MODE: "public",
    RESERVATION_SDK_REGISTRY_PACKAGE_SPECS:
      "@reservation-platform/sdk@1.2.3 @reservation-platform/contract-types@1.2.3",
    RESERVATION_SDK_REGISTRY_ALLOW_INSTALL: "1",
    ...overrides,
  };
}

function byId(parsed, id) {
  return parsed.surfaces.find((surface) => surface.id === id);
}

test("live platform proof readiness safely skips when env is absent", () => {
  const parsed = readLivePlatformProofReadiness({}, { argv: [] });

  assert.equal(parsed.strict, false);
  assert.equal(parsed.status, "skip");
  assert.equal(parsed.shouldFail, false);
  assert.equal(parsed.strictReady, false);
  assert.equal(parsed.surfaces.length, 4);
  assert.equal(byId(parsed, "standalone_api_deployment_config").safe.status, "skip");
  assert.equal(byId(parsed, "database_live_migration_proof").safe.status, "skip");
  assert.equal(byId(parsed, "sdk_direct_live_parity").safe.status, "skip");
  assert.equal(byId(parsed, "sdk_registry_install_proof").safe.status, "skip");
  assert.equal(byId(parsed, "standalone_api_deployment_config").strict.status, "fail");
  assert.equal(byId(parsed, "database_live_migration_proof").strict.status, "fail");
  assert.equal(byId(parsed, "sdk_direct_live_parity").strict.status, "fail");
  assert.equal(byId(parsed, "sdk_registry_install_proof").strict.status, "fail");
});

test("live platform proof readiness fails strict mode when proof surfaces are unconfigured", () => {
  const parsed = readLivePlatformProofReadiness({}, { argv: ["--strict"] });

  assert.equal(parsed.strict, true);
  assert.equal(parsed.status, "fail");
  assert.equal(parsed.shouldFail, true);
  assert.equal(parsed.strictReady, false);
  assert.deepEqual(
    parsed.strictFailures.map((surface) => surface.id),
    [
      "standalone_api_deployment_config",
      "database_live_migration_proof",
      "sdk_direct_live_parity",
      "sdk_registry_install_proof",
    ],
  );
});

test("live platform proof readiness accepts fully configured strict command prerequisites", () => {
  const parsed = readLivePlatformProofReadiness(validReadinessEnv(), { argv: ["--strict"] });

  assert.equal(parsed.strict, true);
  assert.equal(parsed.status, "ready");
  assert.equal(parsed.shouldFail, false);
  assert.equal(parsed.strictReady, true);
  assert.equal(parsed.strictFailures.length, 0);
  assert.ok(parsed.surfaces.every((surface) => surface.strict.status === "ready"));
});

test("live platform proof readiness strict mode requires mutation and registry install opt-ins", () => {
  const parsed = readLivePlatformProofReadiness(
    validReadinessEnv({
      RESERVATION_PLATFORM_LIVE_ALLOW_MUTATIONS: undefined,
      RESERVATION_SDK_REGISTRY_ALLOW_INSTALL: undefined,
    }),
    { argv: ["--strict"] },
  );

  assert.equal(parsed.status, "fail");
  assert.deepEqual(
    parsed.strictFailures.map((surface) => surface.id),
    ["sdk_direct_live_parity", "sdk_registry_install_proof"],
  );
  assert.match(byId(parsed, "sdk_direct_live_parity").strict.message, /RESERVATION_PLATFORM_LIVE_ALLOW_MUTATIONS=1/);
  assert.match(byId(parsed, "sdk_registry_install_proof").strict.message, /RESERVATION_SDK_REGISTRY_ALLOW_INSTALL=1/);
});

test("live platform proof readiness can enter strict mode through its env flag", () => {
  const parsed = readLivePlatformProofReadiness(
    {
      [livePlatformProofReadinessStrictEnvName]: "1",
    },
    { argv: [] },
  );

  assert.equal(parsed.strict, true);
  assert.equal(parsed.status, "fail");
  assert.equal(parsed.shouldFail, true);
});

test("safe readiness ignores individual proof strict flags and remains non-failing", () => {
  const parsed = readLivePlatformProofReadiness(
    {
      RESERVATION_DATABASE_LIVE_STRICT: "1",
      RESERVATION_PLATFORM_LIVE_STRICT: "1",
      RESERVATION_SDK_REGISTRY_STRICT: "1",
      RESERVATION_STANDALONE_API_DEPLOYMENT_CONFIG_STRICT: "1",
    },
    { argv: [] },
  );

  assert.equal(parsed.strict, false);
  assert.equal(parsed.status, "skip");
  assert.equal(parsed.shouldFail, false);
  assert.equal(byId(parsed, "standalone_api_deployment_config").safe.status, "skip");
  assert.equal(byId(parsed, "database_live_migration_proof").safe.status, "skip");
  assert.equal(byId(parsed, "sdk_direct_live_parity").safe.status, "skip");
  assert.equal(byId(parsed, "sdk_registry_install_proof").safe.status, "skip");
});

test("safe readiness reports strict readiness when all strict prerequisites are configured", () => {
  const parsed = readLivePlatformProofReadiness(validReadinessEnv(), { argv: [] });

  assert.equal(parsed.strict, false);
  assert.equal(parsed.status, "ready");
  assert.equal(parsed.shouldFail, false);
  assert.equal(parsed.strictReady, true);
  assert.ok(parsed.surfaces.every((surface) => surface.safe.status === "ready"));
  assert.ok(parsed.surfaces.every((surface) => surface.strict.status === "ready"));
});
