import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPsqlCommands,
  loadMigrationProofPlan,
  readLiveDatabaseConfig,
} from "./verify-database-live-proof.mjs";

test("database live proof config skips safely when env is absent", () => {
  const parsed = readLiveDatabaseConfig({}, []);

  assert.equal(parsed.ready, false);
  assert.equal(parsed.strict, false);
  assert.deepEqual(parsed.missing, ["RESERVATION_DATABASE_LIVE_URL"]);
  assert.deepEqual(parsed.errors, []);
});

test("database live proof config detects strict mode and malformed env", () => {
  const parsed = readLiveDatabaseConfig(
    {
      RESERVATION_DATABASE_LIVE_STRICT: "1",
      RESERVATION_DATABASE_LIVE_URL: "https://example.test/db",
      RESERVATION_DATABASE_LIVE_INCLUDE_AI_RETRIEVAL: "true",
    },
    [],
  );

  assert.equal(parsed.ready, false);
  assert.equal(parsed.strict, true);
  assert.deepEqual(parsed.missing, []);
  assert.match(parsed.errors.join(" "), /RESERVATION_DATABASE_LIVE_URL must use postgres or postgresql/);
  assert.match(parsed.errors.join(" "), /RESERVATION_DATABASE_LIVE_INCLUDE_AI_RETRIEVAL must be 1 when set/);
});

test("database live proof config accepts PostgreSQL URL and optional plan flags", () => {
  const parsed = readLiveDatabaseConfig(
    {
      RESERVATION_DATABASE_LIVE_URL: "postgres://user:pass@localhost:5432/reservation_test",
      RESERVATION_DATABASE_LIVE_PSQL: "psql",
      RESERVATION_DATABASE_LIVE_INCLUDE_AI_RETRIEVAL: "1",
      RESERVATION_DATABASE_LIVE_INCLUDE_DEVELOPMENT_SEEDS: "1",
    },
    ["--strict"],
  );

  assert.equal(parsed.ready, true);
  assert.equal(parsed.strict, true);
  assert.deepEqual(parsed.missing, []);
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.values.RESERVATION_DATABASE_LIVE_URL, "postgres://user:pass@localhost:5432/reservation_test");
});

test("database live proof plan selects backend-owned core migrations by default", async () => {
  const plan = await loadMigrationProofPlan();

  assert.equal(plan.migrations.length, 11);
  assert.equal(plan.seeds.length, 0);
  assert.equal(plan.entries.length, 11);
  assert.ok(plan.entries.every((entry) => entry.path.startsWith("packages/database/migrations/supabase/")));
  assert.equal(plan.entries.some((entry) => entry.path.includes("/optional/")), false);
});

test("database live proof plan can include optional AI retrieval migrations and development seed", async () => {
  const plan = await loadMigrationProofPlan({
    includeAiRetrieval: true,
    includeDevelopmentSeeds: true,
  });

  assert.equal(plan.migrations.length, 14);
  assert.equal(plan.seeds.length, 1);
  assert.equal(plan.entries.length, 15);
  assert.ok(
    plan.entries.some(
      (entry) =>
        entry.path === "packages/database/migrations/supabase/optional/ai-retrieval/000001_knowledge_chunks.sql",
    ),
  );
  assert.ok(plan.entries.some((entry) => entry.path === "packages/database/seeds/development/project-play-compat.sql"));
});

test("database live proof plan rejects shuffled migration index data through package validation", async () => {
  const shuffledMigrationIndex = {
    schemaVersion: 1,
    artifact: "@reservation-platform/database/supabase-migration-index",
    coreMigrations: [
      {
        kind: "core",
        order: 2,
        path: "packages/database/migrations/supabase/000002_platform_tenant_auth.sql",
        module: "core",
        scope: "reservation-platform",
        sha256: "95876f22f1432c6bd3c9375b4c599a7a872c565b6fb3e44a52bae4579e36f864",
        bytes: 1185,
      },
      {
        kind: "core",
        order: 1,
        path: "packages/database/migrations/supabase/000001_extensions.sql",
        module: "core",
        scope: "reservation-platform",
        sha256: "6a6504714d0ca20b88ec70941b04afc3c1cbc1132432470db50c823bc4aa786c",
        bytes: 383,
      },
    ],
    optionalMigrations: [],
    developmentSeeds: [],
  };

  await assert.rejects(
    loadMigrationProofPlan({ migrationIndex: shuffledMigrationIndex }),
    /core migration order must be contiguous and sorted from 1/,
  );
});

test("database live proof builds psql commands without shell interpolation", async () => {
  const plan = await loadMigrationProofPlan();
  const [first] = buildPsqlCommands(
    {
      databaseUrl: "postgres://user:pass@localhost:5432/reservation_test",
      psqlCommand: "psql",
    },
    { entries: plan.entries.slice(0, 1) },
  );

  assert.equal(first.command, "psql");
  assert.deepEqual(first.args.slice(0, 4), [
    "postgres://user:pass@localhost:5432/reservation_test",
    "-v",
    "ON_ERROR_STOP=1",
    "-f",
  ]);
  assert.match(first.args[4], /packages.database.migrations.supabase.000001_extensions\.sql$/);
  assert.equal(first.args.some((arg) => String(arg).includes(";")), false);
});
