#!/usr/bin/env node

import { lstat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { redactProofText } from "./verify-clean-install.mjs";

export const FAILURE_DRILLS = Object.freeze([
  drill("restart-api-with-active-session", "authenticate synthetic owner", "restart API", "session remains usable after readiness", "wait for healthy API", "no session or reservation loss"),
  drill("restart-worker-with-leased-job", "lease synthetic notification job", "restart worker", "lease expires without duplicate delivery", "worker reclaims or completes job", "one delivery and no stuck lease"),
  drill("disable-ai-provider", "open synthetic AI conversation", "disable provider", "chat degrades without claiming a booking", "restore tested provider", "conversation and proposal remain consistent"),
  drill("disconnect-whatsapp", "connect synthetic WhatsApp session", "disconnect session", "channel reports disconnected without QR leakage", "reconnect session", "conversation history remains intact"),
  drill("reject-smtp-delivery", "queue synthetic appointment email", "reject SMTP delivery", "job retries with safe error code", "restore SMTP and retry", "one eventual delivery"),
  drill("stop-database", "establish healthy readiness", "stop database", "readiness fails while liveness remains safe", "restart database", "records remain unchanged"),
  drill("simulate-low-disk", "record healthy disk status", "activate bounded low-disk simulation", "status degrades and write-heavy operation refuses", "remove simulation", "no partial backup or upgrade"),
  drill("submit-stale-slot", "read one available slot", "book slot through competing request", "stale submission returns conflict", "refresh availability", "only winning reservation exists"),
  drill("submit-duplicate-idempotency-key", "prepare one booking payload", "repeat identical key and payload", "response replays identically", "inspect idempotency record", "one reservation and notification"),
  drill("fail-target-upgrade-readiness", "create verified backup and compatible target", "start target with failed readiness", "target receives no public traffic", "restart previous pinned images", "previous release and data are healthy"),
]);

export const CONCURRENCY_PROOF = Object.freeze({
  competingRequests: 50,
  correlationIds: Object.freeze(Array.from({ length: 50 }, (_, index) =>
    `release-proof-${String(index + 1).padStart(3, "0")}`
  )),
  duplicateIdempotencyRequests: 2,
  assertions: Object.freeze([
    "exactly-one-reservation",
    "duplicate-response-identical",
    "one-notification",
    "no-stuck-proposal-claim",
  ]),
});

const identities = ["anonymous", "owner", "staff", "service"];
const routeGroups = [
  "setup", "auth", "owner-settings", "staff-assignments", "public-booking",
  "management-links", "conversations", "system-status", "backups", "support-bundles",
];
const controls = [
  "csrf", "exact-cors", "cookie-flags", "rate-limits", "body-limits", "timeout",
  "secret-redaction", "qr-no-store", "private-database-network", "private-postgrest-network",
];

export const SECURITY_BOUNDARY_PROOF = Object.freeze({
  identities: Object.freeze(identities),
  routeGroups: Object.freeze(routeGroups),
  controls: Object.freeze(controls),
  checks: Object.freeze([
    ...identities.flatMap((identity) => routeGroups.map((route) => ({
      id: `identity:${identity}:${route}`,
      identity,
      route,
    }))),
    ...controls.map((control) => ({ id: `control:${control}`, control })),
  ]),
});

export const RECOVERY_PROOF = Object.freeze({
  steps: Object.freeze([
    "create-verified-backup",
    "restore-clean-installation",
    "compare-stable-identifiers-and-counts",
    "run-healthy-upgrade",
    "fail-target-readiness",
    "assert-target-not-public",
    "recover-previous-release",
  ]),
});

export async function runReleaseDrills({ driver }) {
  const completedGates = [];
  for (const definition of FAILURE_DRILLS) {
    let result;
    try {
      result = await driver.runFailureDrill(definition);
    } catch (error) {
      return failure(definition.id, completedGates, error);
    }
    if (
      result?.degradedAsExpected !== true
      || result?.recovered !== true
      || result?.integrityPreserved !== true
    ) {
      return failure(definition.id, completedGates, "failure drill assertions did not pass");
    }
    completedGates.push(definition.id);
  }

  const concurrencyErrors = validateConcurrencyResult(await driver.runConcurrency(CONCURRENCY_PROOF));
  if (concurrencyErrors.length) return failure("concurrency", completedGates, concurrencyErrors.join("; "));
  completedGates.push("concurrency");

  const securityErrors = validateSecurityResult(await driver.runSecurityBoundaries(SECURITY_BOUNDARY_PROOF));
  if (securityErrors.length) return failure("security-boundaries", completedGates, securityErrors.join("; "));
  completedGates.push("security-boundaries");

  const recoveryErrors = validateRecoveryResult(await driver.runRecovery(RECOVERY_PROOF));
  if (recoveryErrors.length) return failure("recovery", completedGates, recoveryErrors.join("; "));
  completedGates.push("recovery");

  return { status: "passed", completedGates };
}

export function validateConcurrencyResult(result) {
  const errors = [];
  if (result?.competingRequests !== 50) errors.push("concurrency proof did not submit fifty requests");
  if (result?.createdReservations !== 1) errors.push("concurrency proof must create exactly one reservation");
  if (result?.duplicateResponsesIdentical !== true) errors.push("duplicate idempotency response changed");
  if (result?.notificationCount !== 1) errors.push("concurrency proof must produce one notification");
  if (result?.stuckProposalClaims !== 0) errors.push("concurrency proof left a stuck proposal claim");
  return errors;
}

export function validateSecurityResult(result) {
  const errors = [];
  const passed = new Set(result?.passedCheckIds ?? []);
  for (const check of SECURITY_BOUNDARY_PROOF.checks) {
    if (!passed.has(check.id)) errors.push(`security check failed: ${check.id}`);
  }
  const ports = Array.isArray(result?.publicPorts) ? [...result.publicPorts].sort((a, b) => a - b) : [];
  if (JSON.stringify(ports) !== JSON.stringify([22, 80, 443])) {
    errors.push("unexpected public ports detected");
  }
  return errors;
}

export function validateRecoveryResult(result) {
  const assertions = [
    ["backupVerified", "backup was not verified"],
    ["stableIdentifiersMatch", "stable identifiers changed after restore"],
    ["recordCountsMatch", "record counts changed after restore"],
    ["healthyUpgradePassed", "healthy upgrade failed"],
    ["failedTargetBlockedFromTraffic", "failed target received public traffic"],
    ["previousReleaseRecovered", "previous release did not recover"],
  ];
  return assertions.filter(([key]) => result?.[key] !== true).map(([, message]) => message);
}

export function readReleaseDrillConfig(env, argv = []) {
  const required = [
    "RESERVATION_PROOF_DRILL_DRIVER",
    "RESERVATION_PROOF_BASE_URL",
    "RESERVATION_PROOF_RELEASE_MANIFEST",
    "RESERVATION_PROOF_OWNER_CREDENTIAL_FILE",
  ];
  const strict = argv.includes("--strict") || env.RESERVATION_PROOF_STRICT === "1";
  const missing = required.filter((name) => !env[name]?.trim());
  if (missing.length) {
    return {
      status: strict ? "failed" : "skipped",
      strict,
      missing,
      message: `release drill configuration is incomplete: missing ${missing.join(", ")}`,
    };
  }
  return {
    status: "ready",
    strict,
    config: {
      driverPath: path.resolve(env.RESERVATION_PROOF_DRILL_DRIVER.trim()),
      baseUrl: env.RESERVATION_PROOF_BASE_URL.trim(),
      releaseManifestPath: path.resolve(env.RESERVATION_PROOF_RELEASE_MANIFEST.trim()),
      ownerCredentialFile: path.resolve(env.RESERVATION_PROOF_OWNER_CREDENTIAL_FILE.trim()),
    },
  };
}

function drill(id, setup, mutation, expected, recovery, integrity) {
  return Object.freeze({ id, setup, mutation, expected, recovery, integrity });
}

function failure(failedGate, completedGates, error) {
  return {
    status: "failed",
    failedGate,
    completedGates,
    reason: redactProofText(error instanceof Error ? error.message : String(error)),
  };
}

async function assertBoundedRegularFile(filePath) {
  const state = await lstat(filePath);
  if (!state.isFile() || state.isSymbolicLink() || state.size > 64 * 1024) {
    throw new Error("Release drill input must be a bounded regular file.");
  }
}

async function main() {
  const configuration = readReleaseDrillConfig(process.env, process.argv.slice(2));
  if (configuration.status !== "ready") {
    process.stdout.write(`${JSON.stringify(configuration)}\n`);
    if (configuration.status === "failed") process.exitCode = 1;
    return;
  }
  const config = configuration.config;
  await Promise.all([
    assertBoundedRegularFile(config.driverPath),
    assertBoundedRegularFile(config.releaseManifestPath),
    assertBoundedRegularFile(config.ownerCredentialFile),
  ]);
  const module = await import(pathToFileURL(config.driverPath).href);
  if (typeof module.createReleaseDrillDriver !== "function") {
    throw new Error("Release drill driver must export createReleaseDrillDriver().");
  }
  const driver = await module.createReleaseDrillDriver(Object.freeze({ ...config }));
  const result = await runReleaseDrills({ driver });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status !== "passed") process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${redactProofText(error instanceof Error ? error.message : "Release drills failed.")}\n`);
    process.exitCode = 1;
  });
}
