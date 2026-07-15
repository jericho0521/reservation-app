#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const BACKUP_SCHEMA_VERSION = 1;

const sha256Pattern = /^[a-f0-9]{64}$/u;
const migrationPattern = /^\d{6}$/u;
const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const requiredFiles = Object.freeze([
  "database.dump",
  "secrets/installation-id",
  "secrets/installation-master-key",
  "secrets/internal-service-key",
  "secrets/whatsapp-session-key",
  "whatsapp/",
]);

export function validateBackupManifest(manifest, options = {}) {
  const errors = [];
  if (manifest?.schemaVersion !== BACKUP_SCHEMA_VERSION) errors.push("unsupported backup schema version");
  if (typeof manifest?.createdAt !== "string" || Number.isNaN(Date.parse(manifest.createdAt))) errors.push("invalid backup creation time");
  if (typeof manifest?.releaseVersion !== "string" || !manifest.releaseVersion.trim()) errors.push("invalid backup release version");
  if (!migrationPattern.test(manifest?.migrationVersion ?? "")) errors.push("invalid backup migration version");
  if (!uuidPattern.test(manifest?.installationId ?? "")) errors.push("invalid backup installation id");
  if (!sha256Pattern.test(manifest?.databaseSha256 ?? "")) errors.push("invalid database checksum");

  const files = Array.isArray(manifest?.files) ? manifest.files : [];
  if (files.some((file) => typeof file !== "string" || path.posix.isAbsolute(file) || file.includes("\\") || file.split("/").includes(".."))) {
    errors.push("backup contains an invalid archive path");
  }
  if (new Set(files).size !== files.length) errors.push("backup contains duplicate archive entries");
  for (const requiredFile of requiredFiles) {
    if (!files.includes(requiredFile)) {
      errors.push(requiredFile === "whatsapp/" ? "missing whatsapp/ state declaration" : `missing ${requiredFile}`);
    }
  }
  if (files.includes("secrets/backup-recovery-key")) errors.push("backup must not contain secrets/backup-recovery-key");
  if (files.some((file) => /(?:^|\/)temporary-?qr(?:\.|\/|$)/iu.test(file))) errors.push("backup must not contain temporary QR state");
  if (files.some((file) => /(?:^|\/)(?:logs?|caddy)(?:\/|$)/iu.test(file))) errors.push("backup must not contain logs or Caddy state");

  const maximumMigrationVersion = options.maximumMigrationVersion;
  if (
    migrationPattern.test(manifest?.migrationVersion ?? "")
    && migrationPattern.test(maximumMigrationVersion ?? "")
    && manifest.migrationVersion > maximumMigrationVersion
  ) {
    errors.push(`backup migration ${manifest.migrationVersion} is newer than supported migration ${maximumMigrationVersion}`);
  }
  if (
    Number.isFinite(options.availableDiskBytes)
    && Number.isFinite(options.requiredDiskBytes)
    && options.availableDiskBytes < options.requiredDiskBytes
  ) {
    errors.push("insufficient disk space for restore");
  }
  return { errors };
}

export async function buildBackupManifest({
  root,
  releaseVersion,
  migrationVersion,
  installationId,
  createdAt = new Date(),
}) {
  const files = await listArchiveEntries(root);
  const database = await readRegularFile(path.join(root, "database.dump"));
  const manifest = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    createdAt: createdAt.toISOString(),
    releaseVersion,
    migrationVersion,
    installationId,
    databaseSha256: createHash("sha256").update(database).digest("hex"),
    files,
  };
  const result = validateBackupManifest(manifest);
  if (result.errors.length) throw new Error(`Backup manifest rejected: ${result.errors.join("; ")}`);
  return manifest;
}

export async function validateBackupDirectory(root, options = {}) {
  let manifest;
  try {
    manifest = JSON.parse(await readRegularFile(path.join(root, "manifest.json"), "utf8"));
  } catch {
    return { errors: ["manifest.json is missing or invalid"] };
  }
  const requiredDiskBytes = options.requiredDiskBytes ?? await restoreDiskRequirement(root);
  const result = validateBackupManifest(manifest, { ...options, requiredDiskBytes });
  if (!result.errors.includes("missing database.dump")) {
    try {
      const database = await readRegularFile(path.join(root, "database.dump"));
      const actual = createHash("sha256").update(database).digest("hex");
      if (actual !== manifest.databaseSha256) result.errors.push("database.dump checksum does not match manifest");
    } catch {
      result.errors.push("database.dump is missing or invalid");
    }
  }
  if (!(manifest.files ?? []).includes("secrets/installation-id")) {
    // The manifest-level missing entry error is sufficient.
  } else {
    try {
      const installationId = (await readRegularFile(path.join(root, "secrets/installation-id"), "utf8")).trim();
      if (installationId !== manifest.installationId) result.errors.push("protected installation id does not match manifest");
    } catch {
      result.errors.push("protected installation id is missing or invalid");
    }
  }
  const actualEntries = await listArchiveEntries(root, { excludeManifest: true }).catch(() => []);
  for (const entry of manifest.files ?? []) {
    if (!actualEntries.includes(entry)) result.errors.push(`declared backup entry is missing: ${entry}`);
  }
  for (const entry of actualEntries) {
    if (!(manifest.files ?? []).includes(entry)) result.errors.push(`undeclared backup entry is present: ${entry}`);
  }
  return result;
}

export function latestCoreMigrationVersion(index) {
  const migrations = index?.coreMigrations;
  const order = migrations?.at(-1)?.order;
  if (
    !Array.isArray(migrations)
    || migrations.length === 0
    || !Number.isSafeInteger(order)
    || order < 1
    || order > 999999
    || migrations.some((entry, position) => entry?.order !== position + 1)
  ) {
    throw new Error("migration index is invalid");
  }
  return String(order).padStart(6, "0");
}

async function restoreDiskRequirement(root) {
  const database = await lstat(path.join(root, "database.dump")).catch(() => ({ size: 0 }));
  return Math.max(database.size * 2, 1);
}

async function listArchiveEntries(root, options = {}) {
  const entries = [];
  async function visit(directory, relative = "") {
    const names = (await readdir(directory)).sort();
    for (const name of names) {
      if (!relative && options.excludeManifest && name === "manifest.json") continue;
      if (!relative && name === "manifest.json") continue;
      const absolute = path.join(directory, name);
      const child = relative ? `${relative}/${name}` : name;
      const state = await lstat(absolute);
      if (state.isSymbolicLink()) throw new Error(`Backup entry must not be a symbolic link: ${child}`);
      if (state.isDirectory()) {
        if (child === "whatsapp") entries.push(`${child}/`);
        await visit(absolute, child);
      } else if (state.isFile()) {
        entries.push(child);
      } else {
        throw new Error(`Backup entry must be a regular file or directory: ${child}`);
      }
    }
  }
  await visit(root);
  return entries.sort((left, right) => left.localeCompare(right));
}

async function readRegularFile(filePath, encoding) {
  const state = await lstat(filePath);
  if (!state.isFile() || state.isSymbolicLink()) throw new Error("not a regular file");
  return readFile(filePath, encoding);
}

function argumentValue(args, flag) {
  const index = args.indexOf(flag);
  if (index < 0 || !args[index + 1] || args[index + 1].startsWith("--")) throw new Error(`${flag} is required`);
  return args[index + 1];
}

async function main(args) {
  const command = args[0];
  if (command === "latest") {
    const index = JSON.parse(await readRegularFile(path.resolve(argumentValue(args, "--index")), "utf8"));
    process.stdout.write(`${latestCoreMigrationVersion(index)}\n`);
    return;
  }
  const root = path.resolve(argumentValue(args, "--root"));
  if (command === "build") {
    const manifest = await buildBackupManifest({
      root,
      releaseVersion: argumentValue(args, "--release"),
      migrationVersion: argumentValue(args, "--migration"),
      installationId: argumentValue(args, "--installation"),
    });
    process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
    return;
  }
  if (command === "verify") {
    const maximumMigrationVersion = argumentValue(args, "--maximum-migration");
    const availableDiskBytes = Number(argumentValue(args, "--available-disk-bytes"));
    const result = await validateBackupDirectory(root, { maximumMigrationVersion, availableDiskBytes });
    if (result.errors.length) throw new Error(result.errors.join("; "));
    process.stdout.write("Backup manifest verified.\n");
    return;
  }
  throw new Error("usage: backup-manifest.mjs build|verify --root <directory> ... | latest --index <migration-index.json>");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`backup-manifest: ${error instanceof Error ? error.message : "validation failed"}\n`);
    process.exitCode = 1;
  });
}
