import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("backup encrypts, independently verifies, and atomically publishes after metadata lock", async () => {
  const source = await readFile("scripts/production/backup.sh", "utf8");
  assertOrdered(source, [
    "pg_advisory_xact_lock",
    "pg_dump",
    "backup-manifest.mjs build",
    "age --encrypt --passphrase",
    "verify-backup.sh",
    'mv "$backup_directory/.$archive_name.tmp"',
    "transition_platform_backup(:'id'::uuid, 'verified'",
  ]);
  assert.match(source, /--exclude-table-data=public\.platform_whatsapp_pairing_state/u);
  assert.match(source, /backup-recovery-key/u);
  assert.doesNotMatch(source, /temporary\/backup-recovery-key/u);
});

test("restore verifies before downtime and rolls every post-swap failure back", async () => {
  const source = await readFile("scripts/production/restore.sh", "utf8");
  assertOrdered(source, [
    "backup-manifest.mjs verify",
    "archive_installation=",
    "compose stop reservation-edge",
    'alter database reservation rename to :"previous"',
    "pg_restore",
  ]);
  assert.match(source, /--confirm-restore/u);
  assert.match(source, /if \[ "\$database_swapped" = "true" \][\s\S]*rollback_restore/u);
  assert.match(source, /previous-keys/u);
  assert.match(source, /previous-whatsapp/u);
  assert.match(source, /previous-keys\/installation-id/u);
  assert.match(source, /previous-keys\/internal-service-key/u);
  assert.match(source, /secrets\/installation-id" "\$config_directory\/installation-id/u);
  assert.match(source, /secrets\/internal-service-key" "\$config_directory\/internal-service-key/u);
  assert.match(source, /drop database if exists reservation/u);
  assert.match(source, /compose up -d --no-deps/u);
});

test("upgrade follows validate-backup-pull-stop-migrate-readiness-smoke order", async () => {
  const source = await readFile("scripts/production/upgrade.sh", "utf8");
  assertOrdered(source, [
    "upgrade-plan.mjs",
    "backup.sh",
    "record_platform_upgrade",
    'compose_with "$next_release" pull',
    'compose_with "$release_file" stop reservation-edge',
    "reservation-migrate",
    "for service in reservation-api reservation-worker reservation-console reservation-booking",
    "up -d --no-deps reservation-edge",
    "smoke.mjs",
    "status = 'healthy'",
  ]);
  assert.match(source, /--allow-compatible-downgrade/u);
  assert.match(source, /--maximum-migration "\$supported_migration"/u);
  assert.match(source, /backup_id/u);
  assert.match(source, /config_directory\/release\.env/u);
  assert.match(source, /install -m 0640 "\$previous_release" "\$release_file"/u);
  assert.doesNotMatch(source, /curl /u);
});

test("operations image and Compose isolate recovery authority", async () => {
  const [dockerfile, compose, backup, restore, verify] = await Promise.all([
    readFile("Dockerfile.production-tools", "utf8"),
    readFile("compose.production.yml", "utf8"),
    readFile("scripts/production/backup.sh", "utf8"),
    readFile("scripts/production/restore.sh", "utf8"),
    readFile("scripts/production/verify-backup.sh", "utf8"),
  ]);
  for (const expected of ["age", "docker-cli", "docker-cli-compose", "postgresql16-client=", "tar"]) {
    assert.match(dockerfile, new RegExp(`^\\s+${expected}`, "mu"));
  }
  assert.match(compose, /reservation-operations:[\s\S]*profiles: \["operations"\]/u);
  assert.match(compose, /\/var\/run\/docker\.sock:\/var\/run\/docker\.sock/u);
  for (const source of [backup, restore, verify]) {
    assert.match(source, /backup-manifest\.mjs latest/u);
    assert.doesNotMatch(source, /000035/u);
  }
});

function assertOrdered(source, values) {
  let previous = -1;
  for (const value of values) {
    const position = source.indexOf(value);
    assert.ok(position > previous, `${value} must appear after the prior operation`);
    previous = position;
  }
}
