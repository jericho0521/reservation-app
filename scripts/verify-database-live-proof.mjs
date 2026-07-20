#!/usr/bin/env node

import { access, readFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tsImport } from "tsx/esm/api";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const migrationIndexPath = path.join(repoRoot, "packages", "database", "migrations", "supabase", "migration-index.json");
const supabaseMigrationsSourcePath = path.join(repoRoot, "packages", "database", "src", "supabase-migrations.ts");
const strict = process.argv.includes("--strict") || process.env.RESERVATION_DATABASE_LIVE_STRICT === "1";

const requiredEnvNames = ["RESERVATION_DATABASE_LIVE_URL"];
export const databaseLiveDockerContainerEnvName = "RESERVATION_DATABASE_LIVE_DOCKER_CONTAINER";

export function readLiveDatabaseConfig(env, argv = []) {
  const values = {
    RESERVATION_DATABASE_LIVE_URL: env.RESERVATION_DATABASE_LIVE_URL?.trim() ?? "",
    RESERVATION_DATABASE_LIVE_PSQL: env.RESERVATION_DATABASE_LIVE_PSQL?.trim() ?? "psql",
    RESERVATION_DATABASE_LIVE_INCLUDE_AI_RETRIEVAL: env.RESERVATION_DATABASE_LIVE_INCLUDE_AI_RETRIEVAL?.trim() ?? "",
    RESERVATION_DATABASE_LIVE_INCLUDE_DEVELOPMENT_SEEDS:
      env.RESERVATION_DATABASE_LIVE_INCLUDE_DEVELOPMENT_SEEDS?.trim() ?? "",
    [databaseLiveDockerContainerEnvName]: env[databaseLiveDockerContainerEnvName]?.trim() ?? "",
  };
  const missing = requiredEnvNames.filter((name) => values[name].length === 0);
  const configured = requiredEnvNames.filter((name) => values[name].length > 0);
  const errors = [];

  if (values.RESERVATION_DATABASE_LIVE_URL) {
    try {
      const url = new URL(values.RESERVATION_DATABASE_LIVE_URL);
      if (!["postgres:", "postgresql:"].includes(url.protocol)) {
        errors.push("RESERVATION_DATABASE_LIVE_URL must use postgres or postgresql.");
      }
      values.RESERVATION_DATABASE_LIVE_URL = url.toString();
    } catch {
      errors.push("RESERVATION_DATABASE_LIVE_URL must be an absolute PostgreSQL connection URL.");
    }
  }

  for (const name of [
    "RESERVATION_DATABASE_LIVE_INCLUDE_AI_RETRIEVAL",
    "RESERVATION_DATABASE_LIVE_INCLUDE_DEVELOPMENT_SEEDS",
  ]) {
    if (values[name] && values[name] !== "1") {
      errors.push(`${name} must be 1 when set.`);
    }
  }

  if (values.RESERVATION_DATABASE_LIVE_PSQL.length === 0) {
    errors.push("RESERVATION_DATABASE_LIVE_PSQL must not be empty when set.");
  }
  if (
    values[databaseLiveDockerContainerEnvName] &&
    !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(values[databaseLiveDockerContainerEnvName])
  ) {
    errors.push(`${databaseLiveDockerContainerEnvName} must be a Docker container name or id using only letters, numbers, dot, underscore, and dash.`);
  }

  return {
    values,
    missing,
    configured,
    errors,
    ready: missing.length === 0 && errors.length === 0,
    strict: argv.includes("--strict") || env.RESERVATION_DATABASE_LIVE_STRICT === "1",
  };
}

export async function loadMigrationProofPlan(options = {}) {
  const rawIndex = options.migrationIndex ?? JSON.parse(await readFile(migrationIndexPath, "utf8"));
  const { buildSupabaseMigrationPlan, loadSupabaseMigrationIndex } = await loadSupabaseMigrationApi();
  const index = loadSupabaseMigrationIndex(rawIndex);
  const packagePlan = buildSupabaseMigrationPlan(index, {
    includeAiRetrieval: options.includeAiRetrieval,
    includeDevelopmentSeeds: options.includeDevelopmentSeeds,
  });
  const entries = packagePlan.entries.map((entry) => ({
    ...entry,
    absolutePath: path.join(repoRoot, entry.path),
  }));

  for (const entry of entries) {
    await access(entry.absolutePath, fsConstants.R_OK);
  }

  return {
    migrations: packagePlan.migrations,
    seeds: packagePlan.seeds,
    entries,
  };
}

async function loadSupabaseMigrationApi() {
  return tsImport(pathToFileURL(supabaseMigrationsSourcePath).href, import.meta.url);
}

export function buildPsqlCommands(config, plan) {
  return plan.entries.map((entry) => ({
    label: entry.path,
    ...(config.dockerContainer
      ? {
          command: "docker",
          args: [
            "exec",
            "-i",
            config.dockerContainer,
            "psql",
            config.databaseUrl,
            "-v",
            "ON_ERROR_STOP=1",
            "-f",
            "-",
          ],
          stdinFile: entry.absolutePath,
        }
      : {
          command: config.psqlCommand,
          args: [
            config.databaseUrl,
            "-v",
            "ON_ERROR_STOP=1",
            "-f",
            entry.absolutePath,
          ],
        }),
  }));
}

export async function resolvePsqlCommand(commandName) {
  const executable = commandName || "psql";
  if (path.isAbsolute(executable) || executable.includes("/") || executable.includes("\\")) {
    await access(executable, fsConstants.X_OK);
    return executable;
  }

  const probeCommand = process.platform === "win32" ? "where.exe" : "sh";
  const probeCommandArgs = process.platform === "win32" ? [executable] : ["-c", `command -v ${shellQuote(executable)}`];
  await runProcess(probeCommand, probeCommandArgs, { stdio: "ignore" });
  return executable;
}

export async function runPsqlPlan(config, plan) {
  const commands = buildPsqlCommands(config, plan);
  for (const command of commands) {
    console.log(`APPLY ${command.label}`);
    if (command.stdinFile) {
      await runProcessWithFileStdin(command.command, command.args, command.stdinFile, { stdio: ["pipe", "inherit", "inherit"] });
    } else {
      await runProcess(command.command, command.args, { stdio: "inherit" });
    }
  }
}

export function buildDatabaseBehaviorProofSql() {
  return `
delete from public.bookings
where id = '20000000-0000-4000-8000-000000000001';
delete from public.platform_idempotency_records
where tenant_id = 'tenant-proof' and key = 'database-live-proof-key';

insert into auth.users (id, email)
values
  ('00000000-0000-4000-8000-000000000001', 'admin-proof@example.invalid'),
  ('00000000-0000-4000-8000-000000000002', 'non-admin-proof@example.invalid')
on conflict (id) do nothing;

insert into public.admin_users (user_id)
values ('00000000-0000-4000-8000-000000000001')
on conflict (user_id) do nothing;

insert into public.tenants (id, name)
values ('database_live_proof', 'Database Live Proof')
on conflict (id) do update set name = excluded.name;

insert into public.venues (id, tenant_id, name)
values (
  '30000000-0000-4000-8000-000000000001',
  'database_live_proof',
  'Database Live Proof Venue'
)
on conflict (id) do update set
  tenant_id = excluded.tenant_id,
  name = excluded.name;

insert into public.services (
  id,
  venue_id,
  name,
  total_seats,
  resource_kind,
  selection_mode,
  reservation_policy
)
values (
  '10000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'Database Live Proof Service',
  4,
  'capacity_bucket',
  'quantity',
  '{"kind":"capacity","selection_mode":"quantity","require_resource_labels":false,"allow_partial_capacity":true}'::jsonb
)
on conflict (id) do update set
  venue_id = excluded.venue_id,
  name = excluded.name,
  total_seats = excluded.total_seats,
  resource_kind = excluded.resource_kind,
  selection_mode = excluded.selection_mode,
  reservation_policy = excluded.reservation_policy;

do $$
begin
  if not exists (
    select 1
    from pg_class
    where oid = 'public.bookings'::regclass
      and relrowsecurity
  ) then
    raise exception 'bookings RLS is not enabled';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'bookings'
      and policyname = 'Public can create bookings'
  ) then
    raise exception 'public booking insert policy is missing';
  end if;
end
$$;

set role anon;
do $$
declare
  v_services integer;
begin
  select count(*) into v_services from public.services;
  if v_services < 1 then
    raise exception 'anon catalog select did not see seeded services';
  end if;
end
$$;

insert into public.bookings (
  id,
  service_id,
  user_name,
  user_email,
  user_phone,
  booking_date,
  start_time,
  end_time,
  seats_booked,
  status,
  interface_type
)
values (
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'Database Proof Customer',
  'database-proof@example.invalid',
  '000',
  current_date + 1,
  '10:00',
  '11:00',
  1,
  'confirmed',
  'form'
);
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000002';
do $$
declare
  v_visible_bookings integer;
begin
  select count(*) into v_visible_bookings from public.bookings;
  if v_visible_bookings <> 0 then
    raise exception 'non-admin authenticated user unexpectedly read bookings';
  end if;
end
$$;
reset role;
reset request.jwt.claim.sub;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
do $$
declare
  v_visible_bookings integer;
begin
  select count(*) into v_visible_bookings from public.bookings;
  if v_visible_bookings < 1 then
    raise exception 'admin authenticated user could not read bookings';
  end if;
end
$$;
reset role;
reset request.jwt.claim.sub;

set role service_role;
do $$
declare
  v_claim record;
begin
  select * into v_claim
  from public.platform_claim_idempotency_record(
    'database-live-proof-key',
    'tenant-proof',
    'post',
    '/v1/reservations',
    'fingerprint-a'
  );
  if v_claim.claimed is not true or v_claim.status <> 'in_progress' then
    raise exception 'first idempotency claim did not create in-progress record';
  end if;

  select * into v_claim
  from public.platform_claim_idempotency_record(
    'database-live-proof-key',
    'tenant-proof',
    'post',
    '/v1/reservations',
    'fingerprint-a'
  );
  if v_claim.claimed is not false or v_claim.status <> 'in_progress' then
    raise exception 'duplicate idempotency claim did not replay in-progress record';
  end if;

  perform public.platform_store_idempotency_record(
    'database-live-proof-key',
    'tenant-proof',
    'post',
    '/v1/reservations',
    'fingerprint-a',
    201,
    '{"reservation_id":"database-live-proof"}'::jsonb
  );

  select * into v_claim
  from public.platform_claim_idempotency_record(
    'database-live-proof-key',
    'tenant-proof',
    'post',
    '/v1/reservations',
    'fingerprint-a'
  );
  if v_claim.claimed is not false
    or v_claim.status <> 'completed'
    or v_claim.response_status <> 201
    or v_claim.response_body->>'reservation_id' <> 'database-live-proof' then
    raise exception 'completed idempotency record did not replay stored response';
  end if;
end
$$;
reset role;
`;
}

export async function runDatabaseBehaviorProof(config) {
  console.log("VERIFY disposable database RLS, tenant/admin visibility, and durable idempotency behavior");
  const sql = buildDatabaseBehaviorProofSql();
  if (config.dockerContainer) {
    await runProcessWithStdin("docker", [
      "exec",
      "-i",
      config.dockerContainer,
      "psql",
      config.databaseUrl,
      "-v",
      "ON_ERROR_STOP=1",
      "-f",
      "-",
    ], sql, { stdio: ["pipe", "inherit", "inherit"] });
    return;
  }

  await runProcessWithStdin(config.psqlCommand, [
    config.databaseUrl,
    "-v",
    "ON_ERROR_STOP=1",
    "-f",
    "-",
  ], sql, { stdio: ["pipe", "inherit", "inherit"] });
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      ...options,
      shell: false,
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with ${signal ?? code}`));
    });
  });
}

async function runProcessWithFileStdin(command, args, stdinFile, options = {}) {
  const input = await readFile(stdinFile);
  await runProcessWithStdin(command, args, input, options);
}

function runProcessWithStdin(command, args, input, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      ...options,
      shell: false,
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with ${signal ?? code}`));
    });
    child.stdin.end(input);
  });
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function fail(message) {
  console.error(`FAILED database live migration proof: ${message}`);
  process.exitCode = 1;
}

function skip(message) {
  console.log(`SKIPPED database live migration proof: ${message}`);
}

async function main() {
  const parsed = readLiveDatabaseConfig(process.env, process.argv.slice(2));
  console.log("Database live migration proof env contract checked.");

  if (parsed.errors.length > 0) {
    const message = parsed.errors.join(" ");
    if (strict) {
      fail(message);
      return;
    }
    skip(`${message} No database connection was made.`);
    return;
  }

  if (!parsed.ready) {
    const details = [
      `missing ${parsed.missing.join(", ")}`,
      parsed.configured.length > 0 ? `configured ${parsed.configured.join(", ")}` : "no live database env configured",
    ].join("; ");
    if (strict) {
      fail(`required live database config is incomplete: ${details}.`);
      return;
    }
    skip(`required live database config is incomplete: ${details}. No database connection was made.`);
    return;
  }

  let psqlCommand = "";
  if (!parsed.values[databaseLiveDockerContainerEnvName]) {
    try {
      psqlCommand = await resolvePsqlCommand(parsed.values.RESERVATION_DATABASE_LIVE_PSQL);
    } catch {
      const message = `psql command was not found or executable: ${parsed.values.RESERVATION_DATABASE_LIVE_PSQL}.`;
      if (strict) {
        fail(message);
        return;
      }
      skip(`${message} No database connection was made.`);
      return;
    }
  }

  const plan = await loadMigrationProofPlan({
    includeAiRetrieval: parsed.values.RESERVATION_DATABASE_LIVE_INCLUDE_AI_RETRIEVAL === "1",
    includeDevelopmentSeeds: parsed.values.RESERVATION_DATABASE_LIVE_INCLUDE_DEVELOPMENT_SEEDS === "1",
  });
  const config = {
    databaseUrl: parsed.values.RESERVATION_DATABASE_LIVE_URL,
    psqlCommand,
    dockerContainer: parsed.values[databaseLiveDockerContainerEnvName],
  };

  console.log(
    `Database live migration proof applying ${plan.migrations.length} migrations and ${plan.seeds.length} seeds from packages/database${config.dockerContainer ? ` through docker container ${config.dockerContainer}` : ""}.`,
  );
  await runPsqlPlan(config, plan);
  await runDatabaseBehaviorProof(config);
  console.log("REPEAT disposable database behavior proof to verify deterministic fixture cleanup");
  await runDatabaseBehaviorProof(config);
  console.log("PASS database live migration proof applied package-owned migration plan and twice verified RLS/idempotency behavior.");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    fail(error instanceof Error ? error.message : String(error));
  });
}
