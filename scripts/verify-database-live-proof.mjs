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

export function readLiveDatabaseConfig(env, argv = []) {
  const values = {
    RESERVATION_DATABASE_LIVE_URL: env.RESERVATION_DATABASE_LIVE_URL?.trim() ?? "",
    RESERVATION_DATABASE_LIVE_PSQL: env.RESERVATION_DATABASE_LIVE_PSQL?.trim() ?? "psql",
    RESERVATION_DATABASE_LIVE_INCLUDE_AI_RETRIEVAL: env.RESERVATION_DATABASE_LIVE_INCLUDE_AI_RETRIEVAL?.trim() ?? "",
    RESERVATION_DATABASE_LIVE_INCLUDE_DEVELOPMENT_SEEDS:
      env.RESERVATION_DATABASE_LIVE_INCLUDE_DEVELOPMENT_SEEDS?.trim() ?? "",
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
    command: config.psqlCommand,
    args: [
      config.databaseUrl,
      "-v",
      "ON_ERROR_STOP=1",
      "-f",
      entry.absolutePath,
    ],
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
    await runProcess(command.command, command.args, { stdio: "inherit" });
  }
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

  let psqlCommand;
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

  const plan = await loadMigrationProofPlan({
    includeAiRetrieval: parsed.values.RESERVATION_DATABASE_LIVE_INCLUDE_AI_RETRIEVAL === "1",
    includeDevelopmentSeeds: parsed.values.RESERVATION_DATABASE_LIVE_INCLUDE_DEVELOPMENT_SEEDS === "1",
  });
  const config = {
    databaseUrl: parsed.values.RESERVATION_DATABASE_LIVE_URL,
    psqlCommand,
  };

  console.log(
    `Database live migration proof applying ${plan.migrations.length} migrations and ${plan.seeds.length} seeds from packages/database.`,
  );
  await runPsqlPlan(config, plan);
  console.log("PASS database live migration proof applied package-owned migration plan.");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    fail(error instanceof Error ? error.message : String(error));
  });
}
