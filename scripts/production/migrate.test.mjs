import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildAtomicMigrationBatch, planProductionMigrations } from "./migrate.mjs";

const indexUrl = new URL("../../packages/database/migrations/supabase/migration-index.json", import.meta.url);

test("production migration planner applies every indexed core migration and no optional or seed input", async () => {
  const index = JSON.parse(await readFile(indexUrl, "utf8"));
  const plan = planProductionMigrations(index, []);

  assert.equal(plan.length, index.coreMigrations.length);
  assert.deepEqual(plan, index.coreMigrations);
  assert.equal(plan.some((entry) => entry.scope !== "reservation-platform"), false);
  assert.equal(plan.some((entry) => /optional|seed/iu.test(entry.path)), false);
});

test("production migration planner is idempotent for a checksum-identical ledger", async () => {
  const index = JSON.parse(await readFile(indexUrl, "utf8"));
  const applied = index.coreMigrations.slice(0, 3).map(({ path, sha256 }) => ({ filename: path, sha256 }));
  const plan = planProductionMigrations(index, applied);

  assert.deepEqual(plan, index.coreMigrations.slice(3));
});

test("production migration planner fails closed for drift or unknown ledger entries", async () => {
  const index = JSON.parse(await readFile(indexUrl, "utf8"));
  const first = index.coreMigrations[0];

  assert.throws(
    () => planProductionMigrations(index, [{ filename: first.path, sha256: "f".repeat(64) }]),
    /changed after it was applied/u,
  );
  assert.throws(
    () => planProductionMigrations(index, [{ filename: "packages/database/migrations/supabase/999999_unknown.sql", sha256: "f".repeat(64) }]),
    /not present in the core migration index/u,
  );
});

test("production runner preserves the API readiness ledger contract and grants service-role read access", async () => {
  const source = await readFile(new URL("./migrate.mjs", import.meta.url), "utf8");

  assert.match(source, /public\.reservation_local_migration_ledger/u);
  assert.match(source, /grant select on public\.reservation_local_migration_ledger to service_role/u);
  assert.doesNotMatch(source, /optionalMigrations|developmentSeeds/u);
});

test("atomic migration batch locks before revalidation and skips a concurrent winner", async () => {
  const entry = {
    path: "packages/database/migrations/supabase/000001_example.sql",
    sha256: "a".repeat(64),
  };
  const batch = await buildAtomicMigrationBatch([entry], {
    coreMigrations: [entry],
    readMigration: async () => "select 'migration-body';",
  });

  const lock = batch.indexOf("pg_advisory_xact_lock");
  const checksumGuard = batch.indexOf("Applied migration checksum mismatch");
  const revalidation = batch.indexOf("as reservation_should_apply");
  const conditional = batch.indexOf(String.raw`\if :reservation_should_apply`);
  const migration = batch.indexOf("select 'migration-body';");
  const ledgerInsert = batch.indexOf("insert into public.reservation_local_migration_ledger");
  const conditionalEnd = batch.indexOf(String.raw`\endif`);

  assert.ok(lock >= 0);
  assert.ok(checksumGuard > lock);
  assert.ok(revalidation > checksumGuard);
  assert.ok(conditional > revalidation);
  assert.ok(migration > conditional);
  assert.ok(ledgerInsert > migration);
  assert.ok(conditionalEnd > ledgerInsert);
  assert.equal(batch.match(/select 'migration-body';/gu)?.length, 1);
  assert.match(batch, /not exists[\s\S]*reservation_local_migration_ledger/iu);
  assert.match(batch, /sha256 <> 'a{64}'/u);
});

test("empty atomic batch locks before validating the complete indexed ledger", async () => {
  const coreMigrations = [
    {
      path: "packages/database/migrations/supabase/000001_example.sql",
      sha256: "a".repeat(64),
    },
    {
      path: "packages/database/migrations/supabase/000002_example.sql",
      sha256: "b".repeat(64),
    },
  ];
  const batch = await buildAtomicMigrationBatch([], { coreMigrations });

  const lock = batch.indexOf("pg_advisory_xact_lock");
  const unknownGuard = batch.indexOf("Unknown migration exists in the applied ledger");
  const checksumGuard = batch.indexOf("Applied migration checksum mismatch in the full ledger");
  const grant = batch.indexOf("grant select on public.reservation_local_migration_ledger");

  assert.ok(lock >= 0);
  assert.ok(unknownGuard > lock);
  assert.ok(checksumGuard > unknownGuard);
  assert.ok(grant > checksumGuard);
  assert.match(batch, /000001_example\.sql/u);
  assert.match(batch, /000002_example\.sql/u);
  assert.doesNotMatch(batch, /reservation_should_apply/u);
});
