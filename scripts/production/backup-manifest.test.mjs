import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildBackupManifest,
  latestCoreMigrationVersion,
  validateBackupDirectory,
  validateBackupManifest,
} from "./backup-manifest.mjs";

const temporaryDirectories = [];

test.afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

test("restore rejects a backup without required key material", () => {
  const result = validateBackupManifest({
    schemaVersion: 1,
    createdAt: "2026-07-15T00:00:00.000Z",
    releaseVersion: "0.1.0",
    migrationVersion: "000036",
    installationId: "123e4567-e89b-42d3-a456-426614174000",
    databaseSha256: "a".repeat(64),
    files: ["database.dump", "whatsapp/"],
  });

  assert.deepEqual(result.errors, [
    "missing secrets/installation-id",
    "missing secrets/installation-master-key",
    "missing secrets/internal-service-key",
    "missing secrets/whatsapp-session-key",
  ]);
});

test("manifest rejects unsupported schema, missing data, newer migrations, and insufficient disk", () => {
  const manifest = validManifest({
    schemaVersion: 2,
    migrationVersion: "000037",
    files: [
      "secrets/installation-id",
      "secrets/installation-master-key",
      "secrets/internal-service-key",
      "secrets/whatsapp-session-key",
    ],
  });

  const result = validateBackupManifest(manifest, {
    maximumMigrationVersion: "000036",
    availableDiskBytes: 99,
    requiredDiskBytes: 100,
  });

  assert.deepEqual(result.errors, [
    "unsupported backup schema version",
    "missing database.dump",
    "missing whatsapp/ state declaration",
    "backup migration 000037 is newer than supported migration 000036",
    "insufficient disk space for restore",
  ]);
});

test("manifest excludes the separate recovery key and temporary QR state", () => {
  const result = validateBackupManifest(validManifest({
    files: [
      ...validManifest().files,
      "secrets/backup-recovery-key",
      "whatsapp/temporary-qr.json",
    ].sort(),
  }));

  assert.deepEqual(result.errors, [
    "backup must not contain secrets/backup-recovery-key",
    "backup must not contain temporary QR state",
  ]);
});

test("directory verification detects a database checksum mismatch", async () => {
  const root = await backupDirectory();
  const manifest = await buildBackupManifest({
    root,
    releaseVersion: "0.1.0",
    migrationVersion: "000036",
    installationId: "123e4567-e89b-42d3-a456-426614174000",
    createdAt: new Date("2026-07-15T00:00:00.000Z"),
  });
  await writeFile(path.join(root, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(path.join(root, "database.dump"), "changed database");

  const result = await validateBackupDirectory(root, {
    maximumMigrationVersion: "000036",
    availableDiskBytes: 1_000_000,
  });

  assert.deepEqual(result.errors, ["database.dump checksum does not match manifest"]);
});

test("builds and verifies a complete deterministic archive manifest", async () => {
  const root = await backupDirectory();
  const manifest = await buildBackupManifest({
    root,
    releaseVersion: "0.1.0",
    migrationVersion: "000036",
    installationId: "123e4567-e89b-42d3-a456-426614174000",
    createdAt: new Date("2026-07-15T00:00:00.000Z"),
  });
  await writeFile(path.join(root, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  assert.deepEqual(manifest.files, [
    "database.dump",
    "secrets/installation-id",
    "secrets/installation-master-key",
    "secrets/internal-service-key",
    "secrets/whatsapp-session-key",
    "whatsapp/",
    "whatsapp/creds.json",
  ]);
  assert.deepEqual(
    (await validateBackupDirectory(root, {
      maximumMigrationVersion: "000036",
      availableDiskBytes: 1_000_000,
    })).errors,
    [],
  );
});

function validManifest(overrides = {}) {
  return {
    schemaVersion: 1,
    createdAt: "2026-07-15T00:00:00.000Z",
    releaseVersion: "0.1.0",
    migrationVersion: "000036",
    installationId: "123e4567-e89b-42d3-a456-426614174000",
    databaseSha256: "a".repeat(64),
    files: [
      "database.dump",
      "secrets/installation-id",
      "secrets/installation-master-key",
      "secrets/internal-service-key",
      "secrets/whatsapp-session-key",
      "whatsapp/",
    ],
    ...overrides,
  };
}

test("latest migration version follows the ordered core migration index", () => {
  const coreMigrations = Array.from({ length: 36 }, (_, index) => ({ order: index + 1 }));
  assert.equal(latestCoreMigrationVersion({ coreMigrations }), "000036");
  assert.throws(
    () => latestCoreMigrationVersion({ coreMigrations: [{ order: 2 }] }),
    /migration index is invalid/u,
  );
});

test("directory verification rejects undeclared archive entries", async () => {
  const root = await backupDirectory();
  const manifest = await buildBackupManifest({
    root,
    releaseVersion: "0.1.0",
    migrationVersion: "000036",
    installationId: "123e4567-e89b-42d3-a456-426614174000",
    createdAt: new Date("2026-07-15T00:00:00.000Z"),
  });
  await writeFile(path.join(root, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(path.join(root, "secrets/backup-recovery-key"), "must-not-be-archived");

  const result = await validateBackupDirectory(root, {
    maximumMigrationVersion: "000036",
    availableDiskBytes: 1_000_000,
  });

  assert.deepEqual(result.errors, [
    "undeclared backup entry is present: secrets/backup-recovery-key",
  ]);
});

test("directory verification binds protected installation identity to the manifest", async () => {
  const root = await backupDirectory();
  const manifest = await buildBackupManifest({
    root,
    releaseVersion: "0.1.0",
    migrationVersion: "000036",
    installationId: "123e4567-e89b-42d3-a456-426614174000",
    createdAt: new Date("2026-07-15T00:00:00.000Z"),
  });
  await writeFile(path.join(root, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(path.join(root, "secrets/installation-id"), "223e4567-e89b-42d3-a456-426614174000");

  const result = await validateBackupDirectory(root, {
    maximumMigrationVersion: "000036",
    availableDiskBytes: 1_000_000,
  });

  assert.deepEqual(result.errors, ["protected installation id does not match manifest"]);
});

async function backupDirectory() {
  const root = await mkdtemp(path.join(tmpdir(), "reservation-backup-manifest-"));
  temporaryDirectories.push(root);
  await mkdir(path.join(root, "secrets"));
  await mkdir(path.join(root, "whatsapp"));
  await writeFile(path.join(root, "database.dump"), "database");
  await writeFile(path.join(root, "secrets/installation-id"), "123e4567-e89b-42d3-a456-426614174000");
  await writeFile(path.join(root, "secrets/installation-master-key"), "master");
  await writeFile(path.join(root, "secrets/internal-service-key"), "internal");
  await writeFile(path.join(root, "secrets/whatsapp-session-key"), "session");
  await writeFile(path.join(root, "whatsapp/creds.json"), "{}");
  return root;
}
