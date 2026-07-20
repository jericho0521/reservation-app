import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  bootstrapLocalProduct,
  buildLocalProductBootstrapSql,
  LOCAL_SETUP_TOKEN_TTL_MS,
} from "./local-stack-bootstrap.mjs";

test("product bootstrap creates only a setup-pending installation and stores only the token hash", () => {
  const installationId = randomUUID();
  const setupToken = "S".repeat(43);
  const setupExpiresAt = "2026-07-26T12:00:00.000Z";
  const sql = buildLocalProductBootstrapSql({ installationId, setupToken, setupExpiresAt });

  assert.match(sql, new RegExp(installationId, "u"));
  assert.match(sql, /reservation\.localhost/u);
  assert.match(sql, new RegExp(createHash("sha256").update(setupToken).digest("hex"), "u"));
  assert.doesNotMatch(sql, new RegExp(setupToken, "u"));
  assert.doesNotMatch(sql, /final_demo|Apex|Harbour|Luma|platform_users|reservable_resources|bookings/u);
  assert.match(sql, /delete from public\.venues[\s\S]*platform_default/u);
  assert.doesNotMatch(sql, /insert into public\.(?:venues|services|reservable_resources|bookings)/u);
  assert.match(sql, /setup_completed_at is null/u);
});

test("product bootstrap validates protected product config and refreshes the local setup window", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "reservation-product-bootstrap-"));
  const installationId = randomUUID();
  const setupToken = "T".repeat(43);
  await Promise.all([
    writeFile(path.join(directory, "stack-mode"), "product", { mode: 0o600 }),
    writeFile(path.join(directory, "installation-id"), installationId, { mode: 0o600 }),
    writeFile(path.join(directory, "setup-token"), setupToken, { mode: 0o600 }),
  ]);
  const now = Date.parse("2026-07-19T12:00:00.000Z");
  let captured;
  const result = await bootstrapLocalProduct({
    env: {
      RESERVATION_DATABASE_URL: "postgresql://postgres:secret@reservation-db:5432/reservation",
      RESERVATION_STACK_CONFIG_DIR: directory,
      RESERVATION_STACK_MODE: "product",
    },
    now: () => now,
    runPsql: async (input) => { captured = input; },
  });

  assert.deepEqual(result, { status: "ready" });
  assert.equal(captured.databaseUrl.includes("reservation-db"), true);
  assert.match(captured.sql, new RegExp(new Date(now + LOCAL_SETUP_TOKEN_TTL_MS).toISOString(), "u"));
  assert.doesNotMatch(captured.sql, new RegExp(setupToken, "u"));
});

test("product bootstrap rejects demo mode before database access", async () => {
  let called = false;
  await assert.rejects(() => bootstrapLocalProduct({
    env: {
      RESERVATION_DATABASE_URL: "postgresql://postgres:secret@reservation-db:5432/reservation",
      RESERVATION_STACK_MODE: "demo",
    },
    runPsql: async () => { called = true; },
  }), /requires product mode/u);
  assert.equal(called, false);
});
