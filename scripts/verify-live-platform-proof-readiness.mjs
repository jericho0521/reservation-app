#!/usr/bin/env node

import { pathToFileURL } from "node:url";

import { readLiveDatabaseConfig } from "./verify-database-live-proof.mjs";
import { readLiveBackendParityConfig } from "./verify-live-backend-parity.mjs";
import { readSdkRegistryInstallConfig } from "./verify-sdk-registry-install.mjs";
import {
  readStandaloneApiDeploymentConfig,
  standaloneApiDeploymentStrictEnvName,
} from "./verify-standalone-api-deployment-config.mjs";

export const livePlatformProofReadinessStrictEnvName = "RESERVATION_LIVE_PLATFORM_PROOF_READINESS_STRICT";

const strictEnvNames = [
  livePlatformProofReadinessStrictEnvName,
  standaloneApiDeploymentStrictEnvName,
  "RESERVATION_DATABASE_LIVE_STRICT",
  "RESERVATION_PLATFORM_LIVE_STRICT",
  "RESERVATION_SDK_REGISTRY_STRICT",
];

const proofSurfaces = [
  {
    id: "standalone_api_deployment_config",
    label: "Standalone backend deployment config",
    safeCommand: "corepack pnpm run backend-platform:verify-standalone-deployment-config",
    strictCommand: "corepack pnpm run backend-platform:verify-standalone-deployment-config:strict",
    read: (env, argv) => fromStatusParser(readStandaloneApiDeploymentConfig(env, { argv })),
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

function main() {
  const parsed = readLivePlatformProofReadiness(process.env, { argv: process.argv.slice(2) });
  console.log("Phase 10 live platform proof readiness checked.");
  console.log("No network, database, registry, install, publish, or live mutation calls were made.");

  for (const surface of parsed.surfaces) {
    printSurface(surface);
  }

  if (parsed.shouldFail) {
    console.error(
      `FAILED Phase 10 live platform proof readiness: ${parsed.strictFailures.length} strict proof surface(s) are not ready to run.`,
    );
    process.exitCode = 1;
    return;
  }

  if (parsed.strictReady) {
    console.log("PASS all existing strict live proof commands are configured enough to run. This is not live proof execution.");
    return;
  }

  console.log("SKIPPED strict live platform proof readiness. Safe mode reported missing or skipped strict proof requirements only.");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
