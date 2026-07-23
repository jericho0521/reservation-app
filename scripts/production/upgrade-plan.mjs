#!/usr/bin/env node

import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/u;
const digestPattern = /^sha256:[a-f0-9]{64}$/u;
const components = Object.freeze(["api", "worker", "console", "booking", "tools"]);
export const SUPPORTED_MIGRATION_VERSION = "000043";

export function validateUpgradePlan(input) {
  const errors = [];
  const target = input?.targetManifest;
  const current = parseSemver(input?.currentVersion);
  const version = parseSemver(target?.version);
  let direction = "invalid";

  if (!current || !version) errors.push("current and target versions must be exact semantic versions");
  else direction = compareSemver(version, current) < 0 ? "downgrade" : compareSemver(version, current) > 0 ? "upgrade" : "same";

  for (const component of components) {
    const image = target?.images?.[component];
    const usesLatest = typeof image?.image !== "string" || /(?:^|:)latest(?:@|$)/u.test(image.image);
    if (usesLatest) errors.push(`${component} image must not use latest`);
    else if (version && (!image.image.endsWith(`:${target.version}`) || image.image.includes("@"))) {
      errors.push(`${component} image must use the target version tag without an embedded digest`);
    }
    if (!digestPattern.test(image?.digest ?? "")) errors.push(`${component} image digest must be an exact sha256`);
  }
  if (direction === "downgrade" && (target?.downgradeCompatible !== true || input?.allowCompatibleDowngrade !== true)) {
    errors.push("downgrade requires explicit compatibility approval");
  }
  if (input?.backup?.status !== "verified") errors.push("pre-upgrade backup is not verified");
  if (
    Number.isFinite(input?.availableDiskBytes)
    && Number.isFinite(input?.requiredDiskBytes)
    && input.availableDiskBytes < input.requiredDiskBytes
  ) errors.push("insufficient disk space for upgrade");
  if (target?.rollbackCompatible === false && input?.restoreDeclared !== true) {
    errors.push("irreversible migration requires an explicit restore declaration");
  }
  if (typeof target?.rollbackCompatible !== "boolean") errors.push("rollback compatibility declaration is required");
  if (!/^\d{6}$/u.test(target?.requiredMigration ?? "")) errors.push("required migration must be a six-digit version");
  else if (target.requiredMigration > (input?.maximumMigrationVersion ?? SUPPORTED_MIGRATION_VERSION)) {
    errors.push(`required migration ${target.requiredMigration} is newer than supported migration ${input?.maximumMigrationVersion ?? SUPPORTED_MIGRATION_VERSION}`);
  }
  if (!parseSemver(target?.minimumFromVersion)) errors.push("minimum from version must be exact semantic version");
  else if (current && compareSemver(current, parseSemver(target.minimumFromVersion)) < 0) errors.push("current release is older than the supported upgrade floor");
  return { errors, direction };
}

export function renderReleaseEnvironment({ domain, manifest }) {
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,62}$/u.test(domain ?? "")) {
    throw new Error("upgrade plan rejected: domain is invalid");
  }
  const validation = validateUpgradePlan({
    currentVersion: manifest.version,
    targetManifest: manifest,
    backup: { status: "verified" },
    availableDiskBytes: 1,
    requiredDiskBytes: 1,
    restoreDeclared: true,
    allowCompatibleDowngrade: true,
    maximumMigrationVersion: SUPPORTED_MIGRATION_VERSION,
  });
  if (validation.errors.some((error) => /image|required migration|minimum from version/u.test(error))) {
    throw new Error(`upgrade plan rejected: ${validation.errors.join("; ")}`);
  }
  const lines = [`RESERVATION_DOMAIN=${domain}`, `RESERVATION_RELEASE=${manifest.version}`];
  for (const component of components) {
    const image = manifest.images[component];
    lines.push(`RESERVATION_${component.toUpperCase()}_IMAGE=${image.image}@${image.digest}`);
  }
  return `${lines.join("\n")}\n`;
}

function parseSemver(value) {
  const match = typeof value === "string" ? value.match(semverPattern) : undefined;
  return match ? match.slice(1, 4).map(Number) : undefined;
}

function compareSemver(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

async function readManifest(filePath) {
  const state = await lstat(filePath);
  if (!state.isFile() || state.isSymbolicLink() || state.size > 64 * 1024) throw new Error("target manifest must be a bounded regular file");
  return JSON.parse(await readFile(filePath, "utf8"));
}

function value(args, flag) {
  const index = args.indexOf(flag);
  if (index < 0 || !args[index + 1] || args[index + 1].startsWith("--")) throw new Error(`${flag} is required`);
  return args[index + 1];
}

async function main(args) {
  const command = args[0];
  const manifest = await readManifest(path.resolve(value(args, "--manifest")));
  if (command === "render") {
    process.stdout.write(renderReleaseEnvironment({ domain: value(args, "--domain"), manifest }));
    return;
  }
  if (command === "validate") {
    const result = validateUpgradePlan({
      currentVersion: value(args, "--current"),
      targetManifest: manifest,
      backup: { status: value(args, "--backup-status") },
      availableDiskBytes: Number(value(args, "--available-disk-bytes")),
      requiredDiskBytes: Number(value(args, "--required-disk-bytes")),
      restoreDeclared: args.includes("--restore-declared"),
      allowCompatibleDowngrade: args.includes("--allow-compatible-downgrade"),
      maximumMigrationVersion: args.includes("--maximum-migration")
        ? value(args, "--maximum-migration")
        : SUPPORTED_MIGRATION_VERSION,
    });
    if (result.errors.length) throw new Error(result.errors.join("; "));
    process.stdout.write(`${JSON.stringify({
      ...result,
      version: manifest.version,
      requiredMigration: manifest.requiredMigration,
      rollbackCompatible: manifest.rollbackCompatible,
    })}\n`);
    return;
  }
  throw new Error("usage: upgrade-plan.mjs validate|render --manifest <file> ...");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`upgrade-plan: ${error instanceof Error ? error.message : "validation failed"}\n`);
    process.exitCode = 1;
  });
}
