#!/usr/bin/env node

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

import { verifyAiChatBoundary } from "./verify-ai-chat-boundary.mjs";
import { verifyBackendPackageGraphBoundary } from "./verify-backend-package-graph-boundary.mjs";
import { verifyBackendPlatformExtractionBoundary } from "./verify-backend-platform-extraction-boundary.mjs";
import { verifyCompatibilityRouteRemovalGate } from "./verify-compatibility-route-removal-gate.mjs";
import { readCurrentFrontendConsumerInstallProofConfig } from "./verify-current-frontend-consumer-install-build-proof.mjs";
import { verifyCurrentFrontendConsumerRepoReadiness } from "./verify-current-frontend-consumer-repo-readiness.mjs";
import { readLiveDatabaseConfig } from "./verify-database-live-proof.mjs";
import { readExtractedBackendInstallProofConfig } from "./verify-extracted-backend-install-build-test-proof.mjs";
import { verifyExtractedBackendWorkspaceReadiness } from "./verify-extracted-backend-workspace-readiness.mjs";
import { readLiveBackendParityConfig } from "./verify-live-backend-parity.mjs";
import { readSdkRegistryInstallConfig } from "./verify-sdk-registry-install.mjs";
import { verifyStandaloneBackendExtractionDryRun } from "./verify-standalone-backend-extraction-dry-run.mjs";
import {
  readStandaloneBackendLiveProofConfig,
  standaloneBackendLiveProofStrictEnvName,
} from "./verify-standalone-backend-live-proof.mjs";
import {
  readStandaloneApiDeploymentConfig,
  standaloneApiDeploymentStrictEnvName,
} from "./verify-standalone-api-deployment-config.mjs";

export const livePlatformProofReadinessStrictEnvName = "RESERVATION_LIVE_PLATFORM_PROOF_READINESS_STRICT";

const execFileAsync = promisify(execFile);

const strictEnvNames = [
  livePlatformProofReadinessStrictEnvName,
  standaloneApiDeploymentStrictEnvName,
  standaloneBackendLiveProofStrictEnvName,
  "RESERVATION_DATABASE_LIVE_STRICT",
  "RESERVATION_PLATFORM_LIVE_STRICT",
  "RESERVATION_SDK_REGISTRY_STRICT",
  "RESERVATION_EXTRACTED_BACKEND_PROOF_STRICT",
  "CURRENT_FRONTEND_CONSUMER_PROOF_STRICT",
];

const frontendConsumerInstallProofSurface = {
  id: "current_frontend_consumer_install_build_proof",
  label: "Current frontend consumer install/build proof",
  safeCommand: "corepack pnpm run current-frontend:consumer-install-proof",
  strictCommand: "corepack pnpm run current-frontend:consumer-install-proof:strict",
  read: (env, argv) => fromStatusParser(readCurrentFrontendConsumerInstallProofConfig(env, { argv })),
};

const proofSurfaces = [
  frontendConsumerInstallProofSurface,
  {
    id: "extracted_backend_install_build_test_proof",
    label: "Extracted backend install/build/test proof",
    safeCommand: "corepack pnpm run backend-platform:extracted-install-proof",
    strictCommand: "corepack pnpm run backend-platform:extracted-install-proof:strict",
    read: (env, argv) => fromStatusParser(readExtractedBackendInstallProofConfig(env, { argv })),
  },
  {
    id: "standalone_api_deployment_config",
    label: "Standalone backend deployment config",
    safeCommand: "corepack pnpm run backend-platform:verify-standalone-deployment-config",
    strictCommand: "corepack pnpm run backend-platform:verify-standalone-deployment-config:strict",
    read: (env, argv) => fromStatusParser(readStandaloneApiDeploymentConfig(env, { argv })),
  },
  {
    id: "standalone_backend_live_health_proof",
    label: "Standalone backend live health/readiness proof",
    safeCommand: "corepack pnpm run backend-platform:live-proof",
    strictCommand: "corepack pnpm run backend-platform:live-proof:strict",
    read: (env, argv) => fromStatusParser(readStandaloneBackendLiveProofConfig(env, { argv })),
  },
  {
    id: "database_live_migration_proof",
    label: "Database migration live proof",
    safeCommand: "corepack pnpm run database:live-proof",
    strictCommand: "corepack pnpm run database:live-proof:strict",
    read: (env, argv) => fromDatabaseParser(readLiveDatabaseConfig(env, argv), argv.includes("--strict")),
  },
  {
    id: "sdk_direct_live_parity",
    label: "SDK/direct live backend parity",
    safeCommand: "corepack pnpm run sdk:live-parity",
    strictCommand: "corepack pnpm run sdk:live-parity:strict",
    read: (env, argv) => fromStatusParser(readLiveBackendParityConfig(env, { argv })),
  },
  {
    id: "sdk_registry_install_proof",
    label: "SDK registry install proof",
    safeCommand: "corepack pnpm run sdk:registry-install-proof",
    strictCommand: "corepack pnpm run sdk:registry-install-proof:strict",
    read: (env, argv) => fromStatusParser(readSdkRegistryInstallConfig(env, { argv })),
  },
];

const localPrerequisiteSurfaces = [
  {
    id: "current_frontend_consumer_repo_readiness",
    label: "Current frontend consumer repo readiness",
    safeCommand: "corepack pnpm run current-frontend:consumer-repo-readiness",
    strictCommand: "corepack pnpm run current-frontend:consumer-repo-readiness",
    verifierName: "currentFrontendConsumerRepoReadiness",
    verify: verifyCurrentFrontendConsumerRepoReadiness,
  },
  {
    id: "compatibility_route_removal_gate",
    label: "Compatibility route removal gate readiness",
    safeCommand: "corepack pnpm run backend-platform:verify-compatibility-route-removal-gate",
    strictCommand: "corepack pnpm run backend-platform:verify-compatibility-route-removal-gate",
    verifierName: "compatibilityRouteRemovalGate",
    allowCustomReadinessMessage: true,
    verify: verifyCompatibilityRouteRemovalGate,
  },
  {
    id: "backend_package_graph_boundary",
    label: "Backend package graph boundary readiness",
    safeCommand: "corepack pnpm run backend-platform:verify-package-graph-boundary",
    strictCommand: "corepack pnpm run backend-platform:verify-package-graph-boundary",
    verifierName: "backendPackageGraphBoundary",
    verify: verifyBackendPackageGraphBoundary,
  },
  {
    id: "backend_ai_chat_boundary",
    label: "Backend AI chat boundary readiness",
    safeCommand: "corepack pnpm run backend-platform:verify-chat-boundary",
    strictCommand: "corepack pnpm run backend-platform:verify-chat-boundary",
    verifierName: "aiChatBoundary",
    verify: verifyAiChatBoundary,
  },
  {
    id: "backend_platform_extraction_boundary",
    label: "Backend platform extraction/source boundary readiness",
    safeCommand: "corepack pnpm run backend-platform:verify-extraction-boundary",
    strictCommand: "corepack pnpm run backend-platform:verify-extraction-boundary",
    verifierName: "backendPlatformExtractionBoundary",
    verify: verifyBackendPlatformExtractionBoundary,
  },
  {
    id: "backend_extraction_dry_run_readiness",
    label: "Backend extraction dry-run readiness",
    safeCommand: "corepack pnpm run backend-platform:verify-extraction-dry-run",
    strictCommand: "corepack pnpm run backend-platform:verify-extraction-dry-run",
    verifierName: "backendExtractionDryRunReadiness",
    verify: verifyStandaloneBackendExtractionDryRun,
  },
  {
    id: "extracted_backend_workspace_readiness",
    label: "Extracted backend workspace readiness",
    safeCommand: "corepack pnpm run backend-platform:verify-extracted-workspace-readiness",
    strictCommand: "corepack pnpm run backend-platform:verify-extracted-workspace-readiness",
    verifierName: "extractedBackendWorkspaceReadiness",
    verify: verifyExtractedBackendWorkspaceReadiness,
  },
  {
    id: "standalone_api_skeleton_readiness",
    label: "Standalone API skeleton build/test readiness",
    safeCommand: "corepack pnpm run backend-platform:verify-standalone-api-skeleton",
    strictCommand: "corepack pnpm run backend-platform:verify-standalone-api-skeleton",
    verifierName: "standaloneApiSkeletonReadiness",
    verify: (options) => verifyPnpmScript("backend-platform:verify-standalone-api-skeleton", options),
  },
  {
    id: "database_migration_bundle_readiness",
    label: "Database migration bundle readiness",
    safeCommand: "corepack pnpm run database:verify-migration-bundle",
    strictCommand: "corepack pnpm run database:verify-migration-bundle",
    verifierName: "databaseMigrationBundleReadiness",
    verify: (options) => verifyPnpmScript("database:verify-migration-bundle", options),
  },
];

async function verifyPnpmScript(scriptName, options = {}) {
  const repoRoot = options.repoRoot ?? process.cwd();
  const command = process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : "corepack";
  const args = process.platform === "win32"
    ? ["/d", "/s", "/c", `corepack pnpm run ${scriptName}`]
    : ["pnpm", "run", scriptName];

  try {
    await execFileAsync(command, args, {
      cwd: repoRoot,
      env: options.env ?? process.env,
      maxBuffer: 1024 * 1024 * 8,
    });
    return {
      ok: true,
      failures: [],
    };
  } catch (error) {
    return {
      ok: false,
      failures: [formatCommandFailure(scriptName, error)],
    };
  }
}

function formatCommandFailure(scriptName, error) {
  const details = [
    error instanceof Error ? error.message : String(error),
    typeof error?.stdout === "string" ? error.stdout.trim() : "",
    typeof error?.stderr === "string" ? error.stderr.trim() : "",
  ].filter(Boolean);

  return `corepack pnpm run ${scriptName} failed${details.length > 0 ? `: ${details.join(" ")}` : "."}`;
}

function trimEnvValue(env, name) {
  return env[name]?.trim() ?? "";
}

function withoutStrictProofFlags(env) {
  const safeEnv = { ...env };
  for (const name of strictEnvNames) {
    safeEnv[name] = "";
  }
  return safeEnv;
}

function configuredNames(parsed) {
  return Array.isArray(parsed.configured) ? parsed.configured : [];
}

function missingNames(parsed) {
  return Array.isArray(parsed.missing) ? parsed.missing : [];
}

function errorMessages(parsed) {
  return Array.isArray(parsed.errors) ? parsed.errors : [];
}

function fromStatusParser(parsed) {
  return {
    status: parsed.status,
    ready: parsed.ready,
    shouldSkip: parsed.shouldSkip,
    shouldFail: parsed.shouldFail,
    message: parsed.message,
    missing: missingNames(parsed),
    configured: configuredNames(parsed),
    errors: errorMessages(parsed),
  };
}

function fromDatabaseParser(parsed, strict) {
  const errors = errorMessages(parsed);
  const ready = parsed.ready && errors.length === 0;
  const status = errors.length > 0
    ? (strict ? "fail" : "skip")
    : ready
      ? "ready"
      : (strict ? "fail" : "skip");
  let message = "";

  if (errors.length > 0) {
    message = errors.join(" ");
  } else if (!ready) {
    const details = [
      `missing ${missingNames(parsed).join(", ")}`,
      configuredNames(parsed).length > 0
        ? `configured ${configuredNames(parsed).join(", ")}`
        : "no live database env configured",
    ].join("; ");
    message = `required live database config is incomplete: ${details}.`;
  }

  return {
    status,
    ready,
    shouldSkip: status === "skip",
    shouldFail: status === "fail",
    message,
    missing: missingNames(parsed),
    configured: configuredNames(parsed),
    errors,
  };
}

function readSurface(surface, env) {
  const safe = surface.read(withoutStrictProofFlags(env), []);
  const strict = surface.read(env, ["--strict"]);

  return {
    id: surface.id,
    label: surface.label,
    safeCommand: surface.safeCommand,
    strictCommand: surface.strictCommand,
    safe,
    strict,
  };
}

function localPrerequisiteStateFromResult(result, options = {}) {
  const failures = Array.isArray(result?.failures) ? result.failures : [];
  const ready = result?.ok === true && failures.length === 0;
  const readinessMessage = options.allowCustomReadinessMessage === true &&
    typeof result?.readinessMessage === "string" &&
    result.readinessMessage.trim().length > 0
    ? result.readinessMessage
    : "local prerequisite gate passed.";

  return {
    status: ready ? "ready" : "fail",
    ready,
    shouldSkip: false,
    shouldFail: !ready,
    message: ready
      ? readinessMessage
      : failures.length > 0
        ? failures.join(" ")
        : "local prerequisite gate failed.",
    missing: [],
    configured: [],
    errors: failures,
  };
}

function localPrerequisiteStateFromError(error) {
  const message = error instanceof Error ? error.message : String(error);

  return {
    status: "fail",
    ready: false,
    shouldSkip: false,
    shouldFail: true,
    message,
    missing: [],
    configured: [],
    errors: [message],
  };
}

async function readLocalPrerequisiteSurface(surface, options = {}) {
  const verifier = options.localPrerequisiteVerifiers?.[surface.verifierName] ?? surface.verify;
  const verifierOptions = {
    ...(options.localPrerequisiteOptions?.[surface.verifierName] ?? {}),
  };

  if (options.repoRoot && !Object.hasOwn(verifierOptions, "repoRoot")) {
    verifierOptions.repoRoot = options.repoRoot;
  }

  let state;
  try {
    state = localPrerequisiteStateFromResult(await verifier(verifierOptions), {
      allowCustomReadinessMessage: surface.allowCustomReadinessMessage,
    });
  } catch (error) {
    state = localPrerequisiteStateFromError(error);
  }

  return {
    id: surface.id,
    label: surface.label,
    kind: "local_prerequisite",
    safeCommand: surface.safeCommand,
    strictCommand: surface.strictCommand,
    safe: state,
    strict: state,
  };
}

export function readLivePlatformProofReadiness(env, options = {}) {
  const argv = options.argv ?? [];
  const strict =
    argv.includes("--strict") ||
    trimEnvValue(env, livePlatformProofReadinessStrictEnvName) === "1";
  const surfaces = proofSurfaces.map((surface) => readSurface(surface, env));
  const strictFailures = surfaces.filter((surface) => surface.strict.status !== "ready");
  const strictReady = strictFailures.length === 0;
  const status = strictReady ? "ready" : (strict ? "fail" : "skip");

  return {
    strict,
    strictReady,
    status,
    shouldFail: strict && !strictReady,
    surfaces,
    strictFailures,
  };
}

export async function verifyLivePlatformProofReadiness(env, options = {}) {
  const parsed = readLivePlatformProofReadiness(env, options);
  const localSurfaces = await Promise.all(
    localPrerequisiteSurfaces.map((surface) => readLocalPrerequisiteSurface(surface, options)),
  );
  const surfaces = [
    localSurfaces[0],
    {
      ...parsed.surfaces[0],
      kind: "live_proof_readiness",
    },
    ...localSurfaces.slice(1),
    ...parsed.surfaces.slice(1).map((surface) => ({
      ...surface,
      kind: "live_proof_readiness",
    })),
  ];
  const strictFailures = surfaces.filter((surface) => surface.strict.status !== "ready");
  const strictReady = strictFailures.length === 0;
  const status = strictReady ? "ready" : (parsed.strict ? "fail" : "skip");

  return {
    ...parsed,
    strictReady,
    status,
    shouldFail: parsed.strict && !strictReady,
    surfaces,
    strictFailures,
  };
}

function printSurface(surface) {
  console.log(`- ${surface.label}`);
  console.log(`  safe command: ${surface.safeCommand}`);
  console.log(`  safe readiness: ${formatSurfaceState(surface.safe)}`);
  console.log(`  strict command: ${surface.strictCommand}`);
  console.log(`  strict readiness: ${formatSurfaceState(surface.strict)}`);
}

function formatSurfaceState(state) {
  const parts = [state.status];
  if (state.message) {
    parts.push(state.message);
  }
  if (state.missing.length > 0) {
    parts.push(`missing: ${state.missing.join(", ")}`);
  }
  if (state.configured.length > 0) {
    parts.push(`configured: ${state.configured.join(", ")}`);
  }
  return parts.join(" | ");
}

async function main() {
  const parsed = await verifyLivePlatformProofReadiness(process.env, { argv: process.argv.slice(2) });
  console.log("Phase 10 live platform proof readiness checked.");
  console.log("No network, database, registry, install, publish, or live mutation calls were made.");

  for (const surface of parsed.surfaces) {
    printSurface(surface);
  }

  if (parsed.shouldFail) {
    console.error(
      `FAILED Phase 10 live platform proof readiness: ${parsed.strictFailures.length} strict readiness surface(s) are not ready to run.`,
    );
    process.exitCode = 1;
    return;
  }

  if (parsed.strictReady) {
    console.log("PASS all strict readiness surfaces are ready. This is not live proof execution.");
    return;
  }

  console.log("SKIPPED strict live platform proof readiness. Safe mode reported readiness surfaces that are not strict-ready.");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error("Phase 10 live platform proof readiness failed unexpectedly:");
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
