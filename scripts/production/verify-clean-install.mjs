#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createCleanInstallOperations,
  createSshRemoteHost,
} from "../../tests/production/remote-host.mjs";

export const CLEAN_INSTALL_STEPS = Object.freeze([
  "preflight",
  "install",
  "readiness",
  "ports",
  "setup-owner",
  "setup-replay",
  "demo-absence",
  "configure-business",
  "public-booking",
]);

const imageComponents = ["api", "worker", "console", "booking", "tools"];
const requiredEnv = [
  "RESERVATION_PROOF_HOST",
  "RESERVATION_PROOF_SSH_USER",
  "RESERVATION_PROOF_SSH_IDENTITY_FILE",
  "RESERVATION_PROOF_DOMAIN",
  "RESERVATION_PROOF_HOST_IP",
  "RESERVATION_PROOF_RELEASE_MANIFEST",
  "RESERVATION_PROOF_OWNER_PASSWORD_FILE",
  "RESERVATION_PROOF_REMOTE_DRIVER",
];

export async function verifyCleanInstall({ operations, releaseManifest }) {
  const manifestErrors = validateImmutableManifest(releaseManifest);
  if (manifestErrors.length > 0) {
    return failedResult("release-manifest", [], manifestErrors.join("; "));
  }

  const completedSteps = [];
  const records = [];
  const definitions = [
    ["preflight", operations.preflight, (value) => (
      ["22.04", "24.04"].includes(value.ubuntuRelease)
      && value.targetEmpty === true
      && value.dnsMatches === true
      && value.signaturesVerified === true
    )],
    ["install", operations.install, (value) => value.demoSeeded !== true],
    ["readiness", operations.readiness, () => true],
    ["ports", operations.ports, (value) => exactPublicPorts(value.publicPorts)],
    ["setup-owner", operations.setupOwner, () => true],
    ["setup-replay", operations.setupReplay, (value) => value.rejected === true],
    ["demo-absence", operations.demoAbsence, (value) => value.absent === true],
    ["configure-business", operations.configureBusiness, (value) => value.published === true],
    ["public-booking", operations.publicBooking, (value) => value.reservationCreated === true],
  ];

  for (const [name, action, validate] of definitions) {
    let result;
    try {
      result = await action();
    } catch (error) {
      result = { ok: false, output: error instanceof Error ? error.message : "proof step failed" };
    }
    records.push({ step: name, ok: result.ok === true, output: redactProofText(result.output ?? "") });
    if (result.ok !== true || !validate(result)) {
      return failedResult(name, completedSteps, `clean-install step failed: ${name}`, records);
    }
    completedSteps.push(name);
  }
  return {
    status: "passed",
    release: releaseManifest.version,
    migration: releaseManifest.requiredMigration,
    completedSteps,
    records,
  };
}

export function readCleanInstallProofConfig(env, argv = []) {
  const strict = argv.includes("--strict") || env.RESERVATION_PROOF_STRICT === "1";
  const missing = requiredEnv.filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    return {
      status: strict ? "failed" : "skipped",
      strict,
      missing,
      message: `clean-install proof configuration is incomplete: missing ${missing.join(", ")}`,
    };
  }
  return {
    status: "ready",
    strict,
    missing: [],
    config: {
      host: env.RESERVATION_PROOF_HOST.trim(),
      user: env.RESERVATION_PROOF_SSH_USER.trim(),
      identityFile: path.resolve(env.RESERVATION_PROOF_SSH_IDENTITY_FILE.trim()),
      domain: env.RESERVATION_PROOF_DOMAIN.trim(),
      hostIp: env.RESERVATION_PROOF_HOST_IP.trim(),
      manifestPath: path.resolve(env.RESERVATION_PROOF_RELEASE_MANIFEST.trim()),
      ownerPasswordFile: path.resolve(env.RESERVATION_PROOF_OWNER_PASSWORD_FILE.trim()),
      remoteDriver: env.RESERVATION_PROOF_REMOTE_DRIVER.trim(),
    },
  };
}

export function redactProofText(value) {
  return String(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/giu, "Bearer [REDACTED]")
    .replace(/\b(password|token|secret|api[_ -]?key|cookie|authorization|qr(?:[_ -]?payload)?)\s*[:=]\s*[^\s,;]+/giu, "$1=[REDACTED]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, "[REDACTED]")
    .replace(/\+?\d[\d ()-]{7,}\d/gu, "[REDACTED]")
    .slice(0, 4_096);
}

function validateImmutableManifest(manifest) {
  const errors = [];
  if (!manifest || typeof manifest !== "object") return ["release manifest is missing"];
  for (const component of imageComponents) {
    const image = manifest.images?.[component];
    if (!image || !/^sha256:[a-f0-9]{64}$/u.test(image.digest ?? "") || /(?:^|:)latest$/u.test(image.image ?? "")) {
      errors.push(`mutable or missing image: ${component}`);
    }
  }
  return errors;
}

function exactPublicPorts(ports) {
  return Array.isArray(ports)
    && JSON.stringify([...ports].sort((a, b) => a - b)) === JSON.stringify([22, 80, 443]);
}

function failedResult(failedStep, completedSteps, reason, records = []) {
  return { status: "failed", failedStep, completedSteps, reason: redactProofText(reason), records };
}

async function readBoundedRegularFile(filePath, maximumBytes) {
  const state = await lstat(filePath);
  if (!state.isFile() || state.isSymbolicLink() || state.size > maximumBytes) {
    throw new Error("Proof input must be a bounded regular file.");
  }
  return await readFile(filePath, "utf8");
}

async function main() {
  const configuration = readCleanInstallProofConfig(process.env, process.argv.slice(2));
  if (configuration.status !== "ready") {
    process.stdout.write(`${JSON.stringify(configuration)}\n`);
    if (configuration.status === "failed") process.exitCode = 1;
    return;
  }
  const config = configuration.config;
  const manifest = JSON.parse(await readBoundedRegularFile(config.manifestPath, 64 * 1024));
  const ownerPassword = (await readBoundedRegularFile(config.ownerPasswordFile, 4 * 1024)).trim();
  if (!ownerPassword) throw new Error("Owner password file is empty.");
  const remote = createSshRemoteHost(config);
  const operations = createCleanInstallOperations(remote, {
    ...config,
    release: manifest.version,
  }, ownerPassword);
  const result = await verifyCleanInstall({ operations, releaseManifest: manifest });
  const safeResult = {
    ...result,
    hostHash: createHash("sha256").update(config.host).digest("hex").slice(0, 16),
  };
  process.stdout.write(`${JSON.stringify(safeResult, null, 2)}\n`);
  if (result.status !== "passed") process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${redactProofText(error instanceof Error ? error.message : "Clean-install proof failed.")}\n`);
    process.exitCode = 1;
  });
}
