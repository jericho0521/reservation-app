#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const finalDemoSeedPath = path.join(repoRoot, "packages/database/seeds/final-demo.sql");
const markerKey = "final-demo-v1";

export function assertLocalStackDatabaseTarget(databaseUrl) {
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("Seed target must be the Compose-managed local database.");
  }
  if (
    (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:")
    || parsed.hostname !== "reservation-db"
    || (parsed.port || "5432") !== "5432"
    || parsed.username !== "postgres"
    || parsed.pathname !== "/reservation"
  ) {
    throw new Error("Seed target must be the Compose-managed local database.");
  }
}

export function shouldApplySeed(markerExists, mode) {
  if (mode !== "first-run" && mode !== "reset") {
    throw new Error("RESERVATION_STACK_SEED_MODE must be first-run or reset.");
  }
  return mode === "reset" || !markerExists;
}

export function runLocalStackSeed(env = process.env) {
  const databaseUrl = env.RESERVATION_DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("RESERVATION_DATABASE_URL is required.");
  assertLocalStackDatabaseTarget(databaseUrl);
  const mode = env.RESERVATION_STACK_SEED_MODE?.trim() || "first-run";
  const psql = env.PSQL_BIN?.trim() || "psql";
  runPsql(psql, databaseUrl, ["--command", stateTableSql]);
  const marker = runPsql(psql, databaseUrl, [
    "--tuples-only",
    "--no-align",
    "--command",
    `select count(*) from public.reservation_local_stack_state where key = '${markerKey}';`,
  ], true).trim() === "1";
  if (!shouldApplySeed(marker, mode)) {
    console.log("Final demo seed already initialized; preserving local changes.");
    return { applied: false };
  }
  runPsql(psql, databaseUrl, ["--file", finalDemoSeedPath]);
  runPsql(psql, databaseUrl, ["--command", markerUpsertSql]);
  console.log(mode === "reset" ? "Final demo data reset complete." : "Final demo data initialized.");
  return { applied: true };
}

function runPsql(psql, databaseUrl, extraArgs, capture = false) {
  const result = spawnSync(psql, [databaseUrl, "--set", "ON_ERROR_STOP=1", "--no-psqlrc", ...extraArgs], {
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : ["ignore", "inherit", "inherit"],
  });
  if (result.error) throw new Error(`Unable to run psql: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`Local seed command failed with exit code ${result.status}.`);
  return result.stdout ?? "";
}

const stateTableSql = `
create table if not exists public.reservation_local_stack_state (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);`;

const markerUpsertSql = `
insert into public.reservation_local_stack_state (key, value, updated_at)
values ('${markerKey}', '{"seed":"packages/database/seeds/final-demo.sql"}'::jsonb, now())
on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at;`;

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runLocalStackSeed();
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Local seed failed.");
    process.exitCode = 1;
  }
}
