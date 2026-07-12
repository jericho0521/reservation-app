import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSupabaseMigrationPlan,
  loadSupabaseMigrationIndex,
} from "./supabase-migrations";

const indexPath = new URL("../migrations/supabase/migration-index.json", import.meta.url);

test("core plan includes exactly 000001 through 000015 in order", async () => {
  const index = await readActualIndex();
  const plan = buildSupabaseMigrationPlan(index);

  assert.deepEqual(
    plan.migrations.map((entry) => entry.path.match(/\/(\d{6})_[^/]+\.sql$/)?.[1]),
    Array.from({ length: 15 }, (_, index) => String(index + 1).padStart(6, "0")),
  );
  assert.equal(plan.migrations.length, 15);
  assert.equal(plan.seeds.length, 0);
});

test("default plan excludes optional AI retrieval and development seed entries", async () => {
  const index = await readActualIndex();
  const plan = buildSupabaseMigrationPlan(index);

  assert.equal(plan.entries.some((entry) => entry.module === "ai-retrieval"), false);
  assert.equal(plan.entries.some((entry) => entry.module === "development-seed"), false);
});

test("AI retrieval option appends optional AI retrieval migrations after core migrations", async () => {
  const index = await readActualIndex();
  const plan = buildSupabaseMigrationPlan(index, { includeAiRetrieval: true });

  assert.deepEqual(
    plan.migrations.slice(15).map((entry) => entry.path),
    [
      "packages/database/migrations/supabase/optional/ai-retrieval/000001_knowledge_chunks.sql",
      "packages/database/migrations/supabase/optional/ai-retrieval/000002_langchain_checkpoints.sql",
      "packages/database/migrations/supabase/optional/ai-retrieval/000003_match_knowledge_security.sql",
    ],
  );
  assert.equal(plan.seeds.length, 0);
});

test("development seed option keeps seed entries separate and after migrations", async () => {
  const index = await readActualIndex();
  const plan = buildSupabaseMigrationPlan(index, { includeDevelopmentSeeds: true });

  assert.deepEqual(
    plan.seeds.map((entry) => entry.path),
    ["packages/database/seeds/development/project-play-compat.sql"],
  );
  assert.deepEqual(plan.entries.slice(-1), plan.seeds);
});

test("plan arrays are frozen copies and do not expose index array references", async () => {
  const index = await readActualIndex();
  const plan = buildSupabaseMigrationPlan(index, {
    includeAiRetrieval: true,
    includeDevelopmentSeeds: true,
  });

  assert.equal(Object.isFrozen(index.coreMigrations), true);
  assert.equal(Object.isFrozen(index.optionalMigrations), true);
  assert.equal(Object.isFrozen(index.developmentSeeds), true);
  assert.equal(Object.isFrozen(plan.migrations), true);
  assert.equal(Object.isFrozen(plan.seeds), true);
  assert.equal(Object.isFrozen(plan.entries), true);
  assert.notEqual(plan.seeds, index.developmentSeeds);
  assert.notEqual(plan.migrations, index.coreMigrations);
});

test("validation fails for duplicate core order", async () => {
  const rawIndex = await readActualRawIndex();
  rawIndex.coreMigrations[1] = {
    ...rawIndex.coreMigrations[1],
    order: rawIndex.coreMigrations[0].order,
  };

  assert.throws(
    () => loadSupabaseMigrationIndex(rawIndex),
    /duplicate core migration order: 1/,
  );
});

test("validation fails for shuffled or gapped core order", async () => {
  const shuffledIndex = await readActualRawIndex();
  const firstOrder = shuffledIndex.coreMigrations[0].order;
  shuffledIndex.coreMigrations[0] = {
    ...shuffledIndex.coreMigrations[0],
    order: shuffledIndex.coreMigrations[1].order,
  };
  shuffledIndex.coreMigrations[1] = {
    ...shuffledIndex.coreMigrations[1],
    order: firstOrder,
  };

  assert.throws(
    () => loadSupabaseMigrationIndex(shuffledIndex),
    /core migration order must be contiguous and sorted from 1/,
  );

  const gappedIndex = await readActualRawIndex();
  gappedIndex.coreMigrations[1] = {
    ...gappedIndex.coreMigrations[1],
    order: 20,
  };

  assert.throws(
    () => loadSupabaseMigrationIndex(gappedIndex),
    /core migration order must be contiguous and sorted from 1/,
  );
});

test("validation fails for shuffled optional AI migration paths", async () => {
  const rawIndex = await readActualRawIndex();
  const firstOptional = rawIndex.optionalMigrations[0];
  rawIndex.optionalMigrations[0] = rawIndex.optionalMigrations[1];
  rawIndex.optionalMigrations[1] = firstOptional;

  assert.throws(
    () => loadSupabaseMigrationIndex(rawIndex),
    /optional migration paths must be contiguous and sorted from 000001/,
  );
});

test("validation fails for duplicate path", async () => {
  const rawIndex = await readActualRawIndex();
  rawIndex.coreMigrations[1] = {
    ...rawIndex.coreMigrations[1],
    path: rawIndex.coreMigrations[0].path,
  };

  assert.throws(
    () => loadSupabaseMigrationIndex(rawIndex),
    /duplicate migration index path:/,
  );
});

test("validation fails for missing required entry fields", async () => {
  const rawIndex = await readActualRawIndex();
  delete rawIndex.coreMigrations[0].sha256;

  assert.throws(
    () => loadSupabaseMigrationIndex(rawIndex),
    /coreMigrations\[0\]\.sha256 is required/,
  );
});

test("validation fails for unsafe paths and weak checksums", async () => {
  const unsafePathIndex = await readActualRawIndex();
  unsafePathIndex.optionalMigrations[0] = {
    ...unsafePathIndex.optionalMigrations[0],
    path: "../outside.sql",
  };

  assert.throws(
    () => loadSupabaseMigrationIndex(unsafePathIndex),
    /optionalMigrations\[0\]\.path must be a package-relative SQL path/,
  );

  const wrongScopeIndex = await readActualRawIndex();
  wrongScopeIndex.developmentSeeds[0] = {
    ...wrongScopeIndex.developmentSeeds[0],
    path: "packages/database/migrations/supabase/000012_seed.sql",
  };

  assert.throws(
    () => loadSupabaseMigrationIndex(wrongScopeIndex),
    /developmentSeeds\[0\]\.path must point to a development seed SQL file/,
  );

  const weakChecksumIndex = await readActualRawIndex();
  weakChecksumIndex.coreMigrations[0] = {
    ...weakChecksumIndex.coreMigrations[0],
    sha256: "not-a-checksum",
  };

  assert.throws(
    () => loadSupabaseMigrationIndex(weakChecksumIndex),
    /coreMigrations\[0\]\.sha256 must be a lowercase 64-character sha256 hex digest/,
  );
});

async function readActualIndex() {
  return loadSupabaseMigrationIndex(await readActualRawIndex());
}

async function readActualRawIndex(): Promise<any> {
  return JSON.parse(await readFile(indexPath, "utf8"));
}
