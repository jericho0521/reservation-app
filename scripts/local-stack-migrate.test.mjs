import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { planCoreMigrations } from "./local-stack-migrate.mjs";

const indexUrl = new URL("../packages/database/migrations/supabase/migration-index.json", import.meta.url);

test("migration planner requires exactly 000001 through 000022 in order", async () => {
  const index = JSON.parse(await readFile(indexUrl, "utf8"));
  const plan = planCoreMigrations(index, []);
  assert.equal(plan.length, 22);
  assert.deepEqual(
    plan.map((entry) => entry.path.match(/\/(\d{6})_/u)?.[1]),
    Array.from({ length: 22 }, (_, index) => String(index + 1).padStart(6, "0")),
  );
  assert.throws(
    () => planCoreMigrations({ ...index, coreMigrations: index.coreMigrations.slice(0, 21) }, []),
    /exactly 22 core migrations/u,
  );
});

test("migration planner skips byte-identical ledger rows", async () => {
  const index = JSON.parse(await readFile(indexUrl, "utf8"));
  const first = index.coreMigrations[0];
  const plan = planCoreMigrations(index, [{ filename: first.path, sha256: first.sha256 }]);
  assert.equal(plan.length, 21);
  assert.equal(plan[0].order, 2);
});

test("migration planner fails closed when an applied file checksum changed", async () => {
  const index = JSON.parse(await readFile(indexUrl, "utf8"));
  const first = index.coreMigrations[0];
  assert.throws(
    () => planCoreMigrations(index, [{ filename: first.path, sha256: "f".repeat(64) }]),
    /changed after it was applied/u,
  );
});

test("migration planner rejects unknown ledger files", async () => {
  const index = JSON.parse(await readFile(indexUrl, "utf8"));
  assert.throws(
    () => planCoreMigrations(index, [{ filename: "packages/database/migrations/supabase/999999_unknown.sql", sha256: "f".repeat(64) }]),
    /not present in the core migration index/u,
  );
});
