import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  currentFrontendConsumerProofAllowInstallEnvName,
  currentFrontendConsumerProofRootEnvName,
  currentFrontendConsumerProofStrictEnvName,
  generatedFrontendConsumerScripts,
} from "./verify-current-frontend-consumer-install-build-proof.mjs";
import {
  expectedGeneratedBackendWorkspaceScript,
  extractedBackendProofAllowInstallEnvName,
  extractedBackendProofRootEnvName,
  extractedBackendProofStrictEnvName,
} from "./verify-extracted-backend-install-build-test-proof.mjs";
import {
  livePlatformProofReadinessStrictEnvName,
  verifyLivePlatformProofReadiness,
} from "./verify-live-platform-proof-readiness.mjs";

async function createPreparedExtractedBackendRoot() {
  const root = await mkdtemp(path.join(tmpdir(), "live-platform-readiness-extracted-backend-"));
  await writeFile(path.join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n", "utf8");
  await writeFile(
    path.join(root, "package.json"),
    `${JSON.stringify({
      name: "reservation-platform-backend",
      private: true,
      scripts: {
        "phase-11:verify-generated-backend-workspace": expectedGeneratedBackendWorkspaceScript,
      },
    }, null, 2)}\n`,
    "utf8",
  );
  return root;
}

async function createPreparedFrontendConsumerRoot() {
  const root = await mkdtemp(path.join(tmpdir(), "live-platform-readiness-frontend-consumer-"));
  await writeFile(path.join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n", "utf8");
  await writeFile(
    path.join(root, "package.json"),
    `${JSON.stringify({
      name: "reservation-frontend-consumer-candidate",
      private: true,
      scripts: generatedFrontendConsumerScripts,
      dependencies: {
        next: "16.1.1",
        react: "19.2.3",
        "@reservation-platform/sdk": "0.0.0",
      },
      devDependencies: {
        typescript: "^5",
      },
    }, null, 2)}\n`,
    "utf8",
  );
  return root;
}

async function validReadinessEnv(t, overrides = {}) {
  const extractedBackendRoot = await createPreparedExtractedBackendRoot();
  const frontendConsumerRoot = await createPreparedFrontendConsumerRoot();
  t.after(async () => {
    await rm(frontendConsumerRoot, { recursive: true, force: true });
    await rm(extractedBackendRoot, { recursive: true, force: true });
  });

  return {
    PORT: "4100",
    RESERVATION_SUPABASE_URL: "https://reservation-platform.supabase.co",
    RESERVATION_SUPABASE_ANON_KEY: "anon-key",
    RESERVATION_SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    RESERVATION_PLATFORM_SERVICE_API_KEY: "platform-service-token",
    RESERVATION_STANDALONE_BACKEND_LIVE_BASE_URL: "https://standalone-backend.example.test",
    RESERVATION_DATABASE_LIVE_URL: "postgres://user:pass@localhost:5432/reservation_disposable",
    RESERVATION_PLATFORM_LIVE_BASE_URL: "https://backend.example.test/platform",
    RESERVATION_PLATFORM_LIVE_TENANT_ID: "tenant_123",
    RESERVATION_PLATFORM_LIVE_API_KEY: "live-api-key",
    RESERVATION_PLATFORM_LIVE_SERVICE_ID: "svc_123",
    RESERVATION_PLATFORM_LIVE_RESOURCE_ID: "resrc_123",
    RESERVATION_PLATFORM_LIVE_START_AT: "2026-06-13T10:00:00.000Z",
    RESERVATION_PLATFORM_LIVE_END_AT: "2026-06-13T11:00:00.000Z",
    RESERVATION_PLATFORM_LIVE_CHAT_MODE: "disabled",
    RESERVATION_PLATFORM_LIVE_ALLOW_MUTATIONS: "1",
    RESERVATION_SDK_REGISTRY_PROOF_MODE: "public",
    RESERVATION_SDK_REGISTRY_PACKAGE_SPECS:
      "@reservation-platform/sdk@1.2.3 @reservation-platform/contract-types@1.2.3",
    RESERVATION_SDK_REGISTRY_ALLOW_INSTALL: "1",
    [currentFrontendConsumerProofRootEnvName]: frontendConsumerRoot,
    [currentFrontendConsumerProofAllowInstallEnvName]: "1",
    [extractedBackendProofRootEnvName]: extractedBackendRoot,
    [extractedBackendProofAllowInstallEnvName]: "1",
    ...overrides,
  };
}

function byId(parsed, id) {
  return parsed.surfaces.find((surface) => surface.id === id);
}

function passingLocalPrerequisiteVerifiers() {
  return {
    currentFrontendConsumerRepoReadiness: async () => ({ ok: true, failures: [] }),
    compatibilityRouteRemovalGate: async () => ({ ok: true, failures: [] }),
    backendPackageGraphBoundary: async () => ({ ok: true, failures: [] }),
    aiChatBoundary: async () => ({ ok: true, failures: [] }),
    backendPlatformExtractionBoundary: async () => ({ ok: true, failures: [] }),
    backendExtractionDryRunReadiness: async () => ({ ok: true, failures: [] }),
    extractedBackendWorkspaceReadiness: async () => ({ ok: true, failures: [] }),
    standaloneApiSkeletonReadiness: async () => ({ ok: true, failures: [] }),
    databaseMigrationBundleReadiness: async () => ({ ok: true, failures: [] }),
  };
}

test("live platform proof readiness includes passing local prerequisite surfaces in the current repo", async () => {
  const parsed = await verifyLivePlatformProofReadiness({}, {
    argv: [],
    localPrerequisiteVerifiers: {
      standaloneApiSkeletonReadiness: async () => ({ ok: true, failures: [] }),
    },
  });

  assert.equal(byId(parsed, "current_frontend_consumer_repo_readiness").safe.status, "ready");
  assert.equal(byId(parsed, "current_frontend_consumer_repo_readiness").strict.status, "ready");
  assert.equal(byId(parsed, "compatibility_route_removal_gate").safe.status, "ready");
  assert.equal(byId(parsed, "compatibility_route_removal_gate").strict.status, "ready");
  assert.equal(byId(parsed, "backend_package_graph_boundary").safe.status, "ready");
  assert.equal(byId(parsed, "backend_package_graph_boundary").strict.status, "ready");
  assert.equal(byId(parsed, "backend_ai_chat_boundary").safe.status, "ready");
  assert.equal(byId(parsed, "backend_ai_chat_boundary").strict.status, "ready");
  assert.equal(byId(parsed, "backend_platform_extraction_boundary").safe.status, "ready");
  assert.equal(byId(parsed, "backend_platform_extraction_boundary").strict.status, "ready");
  assert.equal(byId(parsed, "backend_extraction_dry_run_readiness").safe.status, "ready");
  assert.equal(byId(parsed, "backend_extraction_dry_run_readiness").strict.status, "ready");
  assert.equal(byId(parsed, "extracted_backend_workspace_readiness").safe.status, "ready");
  assert.equal(byId(parsed, "extracted_backend_workspace_readiness").strict.status, "ready");
  assert.equal(byId(parsed, "standalone_api_skeleton_readiness").safe.status, "ready");
  assert.equal(byId(parsed, "standalone_api_skeleton_readiness").strict.status, "ready");
  assert.equal(byId(parsed, "database_migration_bundle_readiness").safe.status, "ready");
  assert.equal(byId(parsed, "database_migration_bundle_readiness").strict.status, "ready");
});

test("live platform proof readiness safely skips live proof env surfaces when env is absent", async () => {
  const parsed = await verifyLivePlatformProofReadiness({}, {
    argv: [],
    localPrerequisiteVerifiers: passingLocalPrerequisiteVerifiers(),
  });

  assert.equal(parsed.strict, false);
  assert.equal(parsed.status, "skip");
  assert.equal(parsed.shouldFail, false);
  assert.equal(parsed.strictReady, false);
  assert.equal(parsed.surfaces.length, 16);
  assert.deepEqual(
    parsed.surfaces.map((surface) => surface.id),
    [
      "current_frontend_consumer_repo_readiness",
      "current_frontend_consumer_install_build_proof",
      "compatibility_route_removal_gate",
      "backend_package_graph_boundary",
      "backend_ai_chat_boundary",
      "backend_platform_extraction_boundary",
      "backend_extraction_dry_run_readiness",
      "extracted_backend_workspace_readiness",
      "standalone_api_skeleton_readiness",
      "database_migration_bundle_readiness",
      "extracted_backend_install_build_test_proof",
      "standalone_api_deployment_config",
      "standalone_backend_live_health_proof",
      "database_live_migration_proof",
      "sdk_direct_live_parity",
      "sdk_registry_install_proof",
    ],
  );
  assert.equal(byId(parsed, "current_frontend_consumer_repo_readiness").safe.status, "ready");
  assert.equal(byId(parsed, "current_frontend_consumer_install_build_proof").safe.status, "skip");
  assert.equal(byId(parsed, "compatibility_route_removal_gate").safe.status, "ready");
  assert.equal(byId(parsed, "backend_package_graph_boundary").safe.status, "ready");
  assert.equal(byId(parsed, "backend_package_graph_boundary").safe.message, "local prerequisite gate passed.");
  assert.equal(byId(parsed, "backend_ai_chat_boundary").safe.status, "ready");
  assert.equal(byId(parsed, "backend_platform_extraction_boundary").safe.status, "ready");
  assert.equal(byId(parsed, "backend_extraction_dry_run_readiness").safe.status, "ready");
  assert.equal(byId(parsed, "extracted_backend_workspace_readiness").safe.status, "ready");
  assert.equal(byId(parsed, "standalone_api_skeleton_readiness").safe.status, "ready");
  assert.equal(byId(parsed, "database_migration_bundle_readiness").safe.status, "ready");
  assert.equal(byId(parsed, "current_frontend_consumer_install_build_proof").strict.status, "fail");
  assert.equal(byId(parsed, "extracted_backend_install_build_test_proof").safe.status, "skip");
  assert.equal(byId(parsed, "standalone_api_deployment_config").safe.status, "skip");
  assert.equal(byId(parsed, "standalone_backend_live_health_proof").safe.status, "skip");
  assert.equal(byId(parsed, "database_live_migration_proof").safe.status, "skip");
  assert.equal(byId(parsed, "sdk_direct_live_parity").safe.status, "skip");
  assert.equal(byId(parsed, "sdk_registry_install_proof").safe.status, "skip");
  assert.equal(byId(parsed, "extracted_backend_install_build_test_proof").strict.status, "fail");
  assert.equal(byId(parsed, "standalone_api_deployment_config").strict.status, "fail");
  assert.equal(byId(parsed, "standalone_backend_live_health_proof").strict.status, "fail");
  assert.equal(byId(parsed, "database_live_migration_proof").strict.status, "fail");
  assert.equal(byId(parsed, "sdk_direct_live_parity").strict.status, "fail");
  assert.equal(byId(parsed, "sdk_registry_install_proof").strict.status, "fail");
});

test("live platform proof readiness surfaces compatibility route non-removability message", async () => {
  const compatibilityMessage =
    "local prerequisite gate passed; 0 removable routes; 28 compatibility routes still blocked by strict prepared-root proof gates.";
  const parsed = await verifyLivePlatformProofReadiness({}, {
    argv: [],
    localPrerequisiteVerifiers: {
      ...passingLocalPrerequisiteVerifiers(),
      compatibilityRouteRemovalGate: async () => ({
        ok: true,
        failures: [],
        routeRemovalSummary: {
          routeCount: 28,
          statusCounts: { blocked: 28 },
          removableRouteCount: 0,
          nonAppOwnedCandidateCount: 28,
          strictProofOpenGateCounts: {
            "current-frontend:consumer-install-proof:strict": 28,
            "backend-platform:extracted-install-proof:strict": 28,
          },
          strictProofBlockedRouteCount: 28,
        },
        readinessMessage: compatibilityMessage,
      }),
    },
  });
  const surface = byId(parsed, "compatibility_route_removal_gate");

  assert.equal(surface.safe.status, "ready");
  assert.equal(surface.strict.status, "ready");
  assert.match(surface.safe.message, /0 removable routes/);
  assert.match(surface.safe.message, /28 compatibility routes still blocked by strict prepared-root proof gates/);
  assert.equal(surface.strict.message, compatibilityMessage);
});

test("live platform proof readiness ignores custom messages from generic local prerequisites", async () => {
  const parsed = await verifyLivePlatformProofReadiness({}, {
    argv: [],
    localPrerequisiteVerifiers: {
      ...passingLocalPrerequisiteVerifiers(),
      backendPackageGraphBoundary: async () => ({
        ok: true,
        failures: [],
        readinessMessage: "backend package graph would like custom text",
      }),
    },
  });
  const surface = byId(parsed, "backend_package_graph_boundary");

  assert.equal(surface.safe.status, "ready");
  assert.equal(surface.safe.message, "local prerequisite gate passed.");
  assert.equal(surface.strict.message, "local prerequisite gate passed.");
});

test("live platform proof readiness fails strict mode when proof surfaces are unconfigured", async () => {
  const parsed = await verifyLivePlatformProofReadiness({}, {
    argv: ["--strict"],
    localPrerequisiteVerifiers: passingLocalPrerequisiteVerifiers(),
  });

  assert.equal(parsed.strict, true);
  assert.equal(parsed.status, "fail");
  assert.equal(parsed.shouldFail, true);
  assert.equal(parsed.strictReady, false);
  assert.deepEqual(
    parsed.strictFailures.map((surface) => surface.id),
    [
      "current_frontend_consumer_install_build_proof",
      "extracted_backend_install_build_test_proof",
      "standalone_api_deployment_config",
      "standalone_backend_live_health_proof",
      "database_live_migration_proof",
      "sdk_direct_live_parity",
      "sdk_registry_install_proof",
    ],
  );
});

test("live platform proof readiness treats frontend consumer install proof as parser-only", async (t) => {
  const parsed = await verifyLivePlatformProofReadiness(await validReadinessEnv(t), {
    argv: ["--strict"],
    localPrerequisiteVerifiers: passingLocalPrerequisiteVerifiers(),
  });
  const surface = byId(parsed, "current_frontend_consumer_install_build_proof");

  assert.equal(surface.kind, "live_proof_readiness");
  assert.equal(surface.safeCommand, "corepack pnpm run current-frontend:consumer-install-proof");
  assert.equal(surface.strictCommand, "corepack pnpm run current-frontend:consumer-install-proof:strict");
  assert.equal(surface.safe.status, "ready");
  assert.equal(surface.strict.status, "ready");
  assert.equal(surface.strict.ready, true);
  assert.equal(surface.strict.message, "");
  assert.deepEqual(surface.strict.errors, []);
});

test("live platform proof readiness includes local prerequisite failures in strict failure list", async (t) => {
  const parsed = await verifyLivePlatformProofReadiness(await validReadinessEnv(t), {
    argv: ["--strict"],
    localPrerequisiteVerifiers: {
      currentFrontendConsumerRepoReadiness: async () => ({
        ok: false,
        failures: ["frontend consumer inventory drifted"],
      }),
      compatibilityRouteRemovalGate: async () => ({
        ok: false,
        failures: ["compatibility route inventory drifted"],
      }),
      backendPackageGraphBoundary: async () => ({
        ok: false,
        failures: ["backend package graph drifted"],
      }),
      aiChatBoundary: async () => ({
        ok: false,
        failures: ["backend AI chat boundary drifted"],
      }),
      backendPlatformExtractionBoundary: async () => ({
        ok: false,
        failures: ["backend source boundary drifted"],
      }),
      backendExtractionDryRunReadiness: async () => ({
        ok: false,
        failures: ["backend extraction dry-run drifted"],
      }),
      extractedBackendWorkspaceReadiness: async () => ({
        ok: false,
        failures: ["extracted backend workspace model drifted"],
      }),
      standaloneApiSkeletonReadiness: async () => ({
        ok: false,
        failures: ["standalone API skeleton drifted"],
      }),
      databaseMigrationBundleReadiness: async () => ({
        ok: false,
        failures: ["database migration bundle drifted"],
      }),
    },
  });

  assert.equal(parsed.strict, true);
  assert.equal(parsed.status, "fail");
  assert.equal(parsed.shouldFail, true);
  assert.equal(parsed.strictReady, false);
  assert.deepEqual(
    parsed.strictFailures.map((surface) => surface.id),
    [
      "current_frontend_consumer_repo_readiness",
      "compatibility_route_removal_gate",
      "backend_package_graph_boundary",
      "backend_ai_chat_boundary",
      "backend_platform_extraction_boundary",
      "backend_extraction_dry_run_readiness",
      "extracted_backend_workspace_readiness",
      "standalone_api_skeleton_readiness",
      "database_migration_bundle_readiness",
    ],
  );
  assert.match(
    byId(parsed, "current_frontend_consumer_repo_readiness").strict.message,
    /frontend consumer inventory drifted/,
  );
  assert.match(
    byId(parsed, "compatibility_route_removal_gate").strict.message,
    /compatibility route inventory drifted/,
  );
  assert.match(
    byId(parsed, "backend_package_graph_boundary").strict.message,
    /backend package graph drifted/,
  );
  assert.match(
    byId(parsed, "backend_ai_chat_boundary").strict.message,
    /backend AI chat boundary drifted/,
  );
  assert.match(
    byId(parsed, "backend_platform_extraction_boundary").strict.message,
    /backend source boundary drifted/,
  );
  assert.match(
    byId(parsed, "backend_extraction_dry_run_readiness").strict.message,
    /backend extraction dry-run drifted/,
  );
  assert.match(
    byId(parsed, "extracted_backend_workspace_readiness").strict.message,
    /extracted backend workspace model drifted/,
  );
  assert.match(
    byId(parsed, "standalone_api_skeleton_readiness").strict.message,
    /standalone API skeleton drifted/,
  );
  assert.match(
    byId(parsed, "database_migration_bundle_readiness").strict.message,
    /database migration bundle drifted/,
  );
});

const newLocalPrerequisiteFailureCases = [
  {
    verifierName: "backendPackageGraphBoundary",
    surfaceId: "backend_package_graph_boundary",
    message: "backend package graph drifted",
  },
  {
    verifierName: "aiChatBoundary",
    surfaceId: "backend_ai_chat_boundary",
    message: "backend AI chat boundary drifted",
  },
  {
    verifierName: "standaloneApiSkeletonReadiness",
    surfaceId: "standalone_api_skeleton_readiness",
    message: "standalone API skeleton drifted",
  },
  {
    verifierName: "databaseMigrationBundleReadiness",
    surfaceId: "database_migration_bundle_readiness",
    message: "database migration bundle drifted",
  },
];

for (const failureCase of newLocalPrerequisiteFailureCases) {
  test(`live platform proof readiness strict mode fails when ${failureCase.surfaceId} fails`, async (t) => {
    const localPrerequisiteVerifiers = {
      ...passingLocalPrerequisiteVerifiers(),
      [failureCase.verifierName]: async () => ({
        ok: false,
        failures: [failureCase.message],
      }),
    };
    const parsed = await verifyLivePlatformProofReadiness(await validReadinessEnv(t), {
      argv: ["--strict"],
      localPrerequisiteVerifiers,
    });

    assert.equal(parsed.strict, true);
    assert.equal(parsed.status, "fail");
    assert.equal(parsed.shouldFail, true);
    assert.equal(parsed.strictReady, false);
    assert.deepEqual(parsed.strictFailures.map((surface) => surface.id), [failureCase.surfaceId]);
    assert.match(byId(parsed, failureCase.surfaceId).strict.message, new RegExp(failureCase.message));
  });
}

test("live platform proof readiness accepts fully configured strict command prerequisites", async (t) => {
  const parsed = await verifyLivePlatformProofReadiness(await validReadinessEnv(t), {
    argv: ["--strict"],
    localPrerequisiteVerifiers: passingLocalPrerequisiteVerifiers(),
  });

  assert.equal(parsed.strict, true);
  assert.equal(parsed.status, "ready");
  assert.equal(parsed.shouldFail, false);
  assert.equal(parsed.strictReady, true);
  assert.equal(parsed.strictFailures.length, 0);
  assert.ok(parsed.surfaces.every((surface) => surface.strict.status === "ready"));
});

test("live platform proof readiness strict mode requires mutation and registry install opt-ins", async (t) => {
  const parsed = await verifyLivePlatformProofReadiness(
    await validReadinessEnv(t, {
      RESERVATION_PLATFORM_LIVE_ALLOW_MUTATIONS: undefined,
      RESERVATION_SDK_REGISTRY_ALLOW_INSTALL: undefined,
    }),
    {
      argv: ["--strict"],
      localPrerequisiteVerifiers: passingLocalPrerequisiteVerifiers(),
    },
  );

  assert.equal(parsed.status, "fail");
  assert.deepEqual(
    parsed.strictFailures.map((surface) => surface.id),
    ["sdk_direct_live_parity", "sdk_registry_install_proof"],
  );
  assert.match(byId(parsed, "sdk_direct_live_parity").strict.message, /RESERVATION_PLATFORM_LIVE_ALLOW_MUTATIONS=1/);
  assert.match(byId(parsed, "sdk_registry_install_proof").strict.message, /RESERVATION_SDK_REGISTRY_ALLOW_INSTALL=1/);
});

test("live platform proof readiness strict mode requires explicit live chat mode", async (t) => {
  const parsed = await verifyLivePlatformProofReadiness(
    await validReadinessEnv(t, {
      RESERVATION_PLATFORM_LIVE_CHAT_MODE: undefined,
    }),
    {
      argv: ["--strict"],
      localPrerequisiteVerifiers: passingLocalPrerequisiteVerifiers(),
    },
  );

  assert.equal(parsed.status, "fail");
  assert.deepEqual(
    parsed.strictFailures.map((surface) => surface.id),
    ["sdk_direct_live_parity"],
  );
  assert.match(
    byId(parsed, "sdk_direct_live_parity").strict.message,
    /RESERVATION_PLATFORM_LIVE_CHAT_MODE=disabled or enabled/,
  );
});

test("live platform proof readiness fails clearly for unsupported enabled live chat proof", async (t) => {
  const parsed = await verifyLivePlatformProofReadiness(
    await validReadinessEnv(t, {
      RESERVATION_PLATFORM_LIVE_CHAT_MODE: "enabled",
    }),
    {
      argv: ["--strict"],
      localPrerequisiteVerifiers: passingLocalPrerequisiteVerifiers(),
    },
  );

  assert.equal(parsed.status, "fail");
  assert.deepEqual(
    parsed.strictFailures.map((surface) => surface.id),
    ["sdk_direct_live_parity"],
  );
  assert.match(
    byId(parsed, "sdk_direct_live_parity").strict.message,
    /enabled live chat proof remains unsupported\/pending/,
  );
});

test("live platform proof readiness can enter strict mode through its env flag", async () => {
  const parsed = await verifyLivePlatformProofReadiness(
    {
      [livePlatformProofReadinessStrictEnvName]: "1",
    },
    {
      argv: [],
      localPrerequisiteVerifiers: passingLocalPrerequisiteVerifiers(),
    },
  );

  assert.equal(parsed.strict, true);
  assert.equal(parsed.status, "fail");
  assert.equal(parsed.shouldFail, true);
});

test("safe readiness ignores individual proof strict flags and remains non-failing", async () => {
  const parsed = await verifyLivePlatformProofReadiness(
    {
      RESERVATION_DATABASE_LIVE_STRICT: "1",
      RESERVATION_PLATFORM_LIVE_STRICT: "1",
      RESERVATION_SDK_REGISTRY_STRICT: "1",
      RESERVATION_STANDALONE_API_DEPLOYMENT_CONFIG_STRICT: "1",
      RESERVATION_STANDALONE_BACKEND_LIVE_PROOF_STRICT: "1",
      [currentFrontendConsumerProofStrictEnvName]: "1",
      [extractedBackendProofStrictEnvName]: "1",
    },
    {
      argv: [],
      localPrerequisiteVerifiers: passingLocalPrerequisiteVerifiers(),
    },
  );

  assert.equal(parsed.strict, false);
  assert.equal(parsed.status, "skip");
  assert.equal(parsed.shouldFail, false);
  assert.equal(byId(parsed, "current_frontend_consumer_install_build_proof").safe.status, "skip");
  assert.equal(byId(parsed, "extracted_backend_install_build_test_proof").safe.status, "skip");
  assert.equal(byId(parsed, "standalone_api_deployment_config").safe.status, "skip");
  assert.equal(byId(parsed, "standalone_backend_live_health_proof").safe.status, "skip");
  assert.equal(byId(parsed, "database_live_migration_proof").safe.status, "skip");
  assert.equal(byId(parsed, "sdk_direct_live_parity").safe.status, "skip");
  assert.equal(byId(parsed, "sdk_registry_install_proof").safe.status, "skip");
});

test("safe readiness reports strict readiness when all strict prerequisites are configured", async (t) => {
  const parsed = await verifyLivePlatformProofReadiness(await validReadinessEnv(t), {
    argv: [],
    localPrerequisiteVerifiers: passingLocalPrerequisiteVerifiers(),
  });

  assert.equal(parsed.strict, false);
  assert.equal(parsed.status, "ready");
  assert.equal(parsed.shouldFail, false);
  assert.equal(parsed.strictReady, true);
  assert.ok(parsed.surfaces.every((surface) => surface.safe.status === "ready"));
  assert.ok(parsed.surfaces.every((surface) => surface.strict.status === "ready"));
});
