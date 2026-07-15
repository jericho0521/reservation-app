#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const toolsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const defaultIndexPath = path.join(
  toolsRoot,
  "packages/database/migrations/supabase/migration-index.json",
);

export function planProductionMigrations(index, ledgerRows) {
  if (
    index?.schemaVersion !== 1
    || index?.artifact !== "@reservation-platform/database/supabase-migration-index"
    || !Array.isArray(index.coreMigrations)
    || index.coreMigrations.length === 0
  ) {
    throw new Error("Production requires a non-empty package-owned core migration index.");
  }

  const indexedByPath = new Map();
  for (const [position, entry] of index.coreMigrations.entries()) {
    const expectedOrder = position + 1;
    const expectedPrefix = String(expectedOrder).padStart(6, "0");
    if (
      entry?.order !== expectedOrder
      || entry?.module !== "core"
      || entry?.scope !== "reservation-platform"
      || typeof entry.path !== "string"
      || !entry.path.startsWith("packages/database/migrations/supabase/")
      || !path.posix.basename(entry.path).startsWith(`${expectedPrefix}_`)
      || typeof entry.sha256 !== "string"
      || !/^[a-f0-9]{64}$/u.test(entry.sha256)
      || !Number.isSafeInteger(entry.bytes)
      || entry.bytes < 0
    ) {
      throw new Error(`Core migration ${expectedOrder} is missing, out of order, or invalid.`);
    }
    indexedByPath.set(entry.path, entry);
  }

  const applied = new Set();
  for (const row of ledgerRows) {
    const indexed = indexedByPath.get(row.filename);
    if (!indexed) {
      throw new Error(`Applied migration ${row.filename} is not present in the core migration index.`);
    }
    if (indexed.sha256 !== row.sha256) {
      throw new Error(`Migration ${row.filename} changed after it was applied.`);
    }
    applied.add(row.filename);
  }

  return index.coreMigrations.filter((entry) => !applied.has(entry.path));
}

export async function runProductionMigrations(options = {}) {
  const env = options.env ?? process.env;
  const databaseUrl = required(env.RESERVATION_DATABASE_URL, "RESERVATION_DATABASE_URL");
  const indexPath = options.indexPath ?? defaultIndexPath;
  const root = options.toolsRoot ?? toolsRoot;
  const psql = env.PSQL_BIN?.trim() || "psql";
  const index = JSON.parse(await readFile(indexPath, "utf8"));

  await verifyIndexedFiles(index.coreMigrations, root);
  runPsql(psql, databaseUrl, ["--single-transaction"], {
    input: `${migrationAdvisoryLockSql}\n${ledgerTableSql}\n`,
  });
  const ledgerOutput = runPsql(psql, databaseUrl, [
    "--tuples-only",
    "--no-align",
    "--field-separator",
    "\t",
    "--command",
    "select filename, sha256 from public.reservation_local_migration_ledger order by filename;",
  ], { capture: true });
  const ledgerRows = parseLedgerRows(ledgerOutput);
  const plan = planProductionMigrations(index, ledgerRows);

  const batch = await buildAtomicMigrationBatch(plan, {
    coreMigrations: index.coreMigrations,
    root,
  });
  runPsql(psql, databaseUrl, ["--single-transaction"], { input: batch });
  process.stdout.write(
    plan.length === 0
      ? "Core migrations are already current.\n"
      : `Reconciled ${plan.length} core migration candidates.\n`,
  );
  return { candidates: plan.length, total: index.coreMigrations.length };
}

export async function buildAtomicMigrationBatch(plan, options = {}) {
  const root = options.root ?? toolsRoot;
  const coreMigrations = options.coreMigrations;
  if (!Array.isArray(coreMigrations) || coreMigrations.length === 0) {
    throw new Error("Atomic migration batch requires the complete core migration index.");
  }
  const readMigration = options.readMigration
    ?? ((entry) => readFile(path.join(root, entry.path), "utf8"));
  const statements = [
    migrationAdvisoryLockSql,
    fullLedgerGuardSql(coreMigrations),
  ];

  for (const entry of plan) {
    const filename = sqlLiteral(entry.path);
    const sha256 = sqlLiteral(entry.sha256);
    statements.push(`
do $reservation_migration_guard$
begin
  if exists (
    select 1
    from public.reservation_local_migration_ledger
    where filename = ${filename}
      and sha256 <> ${sha256}
  ) then
    raise exception 'Applied migration checksum mismatch: %', ${filename};
  end if;
end
$reservation_migration_guard$;

select not exists (
  select 1
  from public.reservation_local_migration_ledger
  where filename = ${filename}
) as reservation_should_apply
\\gset
\\if :reservation_should_apply
${await readMigration(entry)}
insert into public.reservation_local_migration_ledger (filename, sha256)
values (${filename}, ${sha256});
\\endif`);
  }

  statements.push(ledgerReadGrantSql);
  return `${statements.join("\n")}\n`;
}

function fullLedgerGuardSql(coreMigrations) {
  const indexedValues = coreMigrations
    .map((entry) => `(${sqlLiteral(entry.path)}, ${sqlLiteral(entry.sha256)})`)
    .join(",\n      ");
  const indexedTable = `(values
      ${indexedValues}
    ) as indexed(filename, sha256)`;

  return `
do $reservation_full_ledger_guard$
begin
  if exists (
    select 1
    from public.reservation_local_migration_ledger as applied
    left join ${indexedTable}
      on indexed.filename = applied.filename
    where indexed.filename is null
  ) then
    raise exception 'Unknown migration exists in the applied ledger';
  end if;

  if exists (
    select 1
    from public.reservation_local_migration_ledger as applied
    join ${indexedTable}
      on indexed.filename = applied.filename
    where applied.sha256 <> indexed.sha256
  ) then
    raise exception 'Applied migration checksum mismatch in the full ledger';
  end if;
end
$reservation_full_ledger_guard$;`;
}

async function verifyIndexedFiles(entries, root) {
  if (!Array.isArray(entries)) {
    throw new Error("Production migration index is missing core migrations.");
  }
  for (const entry of entries) {
    const absolutePath = path.join(root, entry.path);
    const [contents, file] = await Promise.all([readFile(absolutePath), stat(absolutePath)]);
    const sha256 = createHash("sha256").update(contents).digest("hex");
    if (!file.isFile() || sha256 !== entry.sha256 || file.size !== entry.bytes) {
      throw new Error(`Migration index metadata does not match ${entry.path}.`);
    }
  }
}

function parseLedgerRows(output) {
  const normalized = output.trim();
  if (!normalized) return [];
  return normalized.split("\n").map((line) => {
    const [filename, sha256, ...rest] = line.split("\t");
    if (!filename || !sha256 || rest.length > 0) {
      throw new Error("Production migration ledger returned malformed data.");
    }
    return { filename, sha256 };
  });
}

function runPsql(psql, databaseUrl, extraArgs, options = {}) {
  const result = spawnSync(
    psql,
    [databaseUrl, "--set", "ON_ERROR_STOP=1", "--no-psqlrc", ...extraArgs],
    {
      encoding: "utf8",
      input: options.input,
      stdio: options.capture
        ? ["ignore", "pipe", "pipe"]
        : [options.input === undefined ? "ignore" : "pipe", "inherit", "inherit"],
    },
  );
  if (result.error) throw new Error(`Unable to run psql: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = options.capture && result.stderr?.trim() ? ` ${result.stderr.trim()}` : "";
    throw new Error(`Production migration command failed with exit code ${result.status}.${detail}`);
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

const ledgerReadGrantSql = "grant select on public.reservation_local_migration_ledger to service_role;";
const migrationAdvisoryLockSql = "select pg_advisory_xact_lock(hashtext('reservation-platform-production-migrations'));";

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await runProductionMigrations();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "Production migrations failed."}\n`);
    process.exitCode = 1;
  }
}
