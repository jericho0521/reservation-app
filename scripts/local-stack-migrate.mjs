#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const indexPath = path.join(repoRoot, "packages/database/migrations/supabase/migration-index.json");

export function planCoreMigrations(index, ledgerRows) {
  if (!index || !Array.isArray(index.coreMigrations) || index.coreMigrations.length !== 23) {
    throw new Error("Local stack requires exactly 23 core migrations.");
  }
  const indexedByPath = new Map();
  for (const [position, entry] of index.coreMigrations.entries()) {
    const expectedOrder = position + 1;
    const expectedPrefix = String(expectedOrder).padStart(6, "0");
    if (
      entry?.order !== expectedOrder
      || typeof entry.path !== "string"
      || !entry.path.endsWith(`/${expectedPrefix}_${path.posix.basename(entry.path).slice(7)}`)
      || typeof entry.sha256 !== "string"
      || !/^[a-f0-9]{64}$/u.test(entry.sha256)
    ) {
      throw new Error(`Core migration ${expectedOrder} is missing, out of order, or invalid.`);
    }
    indexedByPath.set(entry.path, entry);
  }

  const applied = new Map();
  for (const row of ledgerRows) {
    const indexed = indexedByPath.get(row.filename);
    if (!indexed) {
      throw new Error(`Applied migration ${row.filename} is not present in the core migration index.`);
    }
    if (indexed.sha256 !== row.sha256) {
      throw new Error(`Migration ${row.filename} changed after it was applied.`);
    }
    applied.set(row.filename, row.sha256);
  }
  return index.coreMigrations.filter((entry) => !applied.has(entry.path));
}

export async function runLocalStackMigrations(env = process.env) {
  const databaseUrl = required(env.RESERVATION_DATABASE_URL, "RESERVATION_DATABASE_URL");
  const psql = env.PSQL_BIN?.trim() || "psql";
  const index = JSON.parse(await readFile(indexPath, "utf8"));
  await verifyIndexedFiles(index.coreMigrations);
  runPsql(psql, databaseUrl, ["--command", ledgerTableSql]);
  const ledgerOutput = runPsql(psql, databaseUrl, [
    "--tuples-only",
    "--no-align",
    "--field-separator",
    "\t",
    "--command",
    "select filename, sha256 from public.reservation_local_migration_ledger order by filename;",
  ], { capture: true });
  const ledgerRows = ledgerOutput.trim() === ""
    ? []
    : ledgerOutput.trim().split("\n").map((line) => {
        const [filename, sha256] = line.split("\t");
        return { filename, sha256 };
      });
  const plan = planCoreMigrations(index, ledgerRows);
  for (const entry of plan) {
    const sql = await readFile(path.join(repoRoot, entry.path), "utf8");
    const ledgerInsert = `insert into public.reservation_local_migration_ledger (filename, sha256) values (${sqlLiteral(entry.path)}, ${sqlLiteral(entry.sha256)});`;
    runPsql(psql, databaseUrl, ["--single-transaction"], { input: `${sql}\n${ledgerInsert}\n` });
    console.log(`Applied ${path.posix.basename(entry.path)}.`);
  }
  console.log(plan.length === 0 ? "Core migrations are already current." : `Applied ${plan.length} core migrations.`);
}

async function verifyIndexedFiles(entries) {
  for (const entry of entries) {
    const absolutePath = path.join(repoRoot, entry.path);
    const [contents, file] = await Promise.all([readFile(absolutePath), stat(absolutePath)]);
    const sha256 = createHash("sha256").update(contents).digest("hex");
    if (sha256 !== entry.sha256 || file.size !== entry.bytes) {
      throw new Error(`Migration index metadata does not match ${entry.path}.`);
    }
  }
}

function runPsql(psql, databaseUrl, extraArgs, options = {}) {
  const result = spawnSync(psql, [databaseUrl, "--set", "ON_ERROR_STOP=1", "--no-psqlrc", ...extraArgs], {
    encoding: "utf8",
    input: options.input,
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : [options.input === undefined ? "ignore" : "pipe", "inherit", "inherit"],
  });
  if (result.error) throw new Error(`Unable to run psql: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = options.capture && result.stderr?.trim() ? ` ${result.stderr.trim()}` : "";
    throw new Error(`Local migration command failed with exit code ${result.status}.${detail}`);
  }
  return result.stdout ?? "";
}

function sqlLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function required(value, name) {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${name} is required.`);
  return normalized;
}

const ledgerTableSql = `
create table if not exists public.reservation_local_migration_ledger (
  filename text primary key,
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  applied_at timestamptz not null default now()
);`;

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await runLocalStackMigrations();
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Local migrations failed.");
    process.exitCode = 1;
  }
}
