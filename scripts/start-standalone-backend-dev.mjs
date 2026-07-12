#!/usr/bin/env node

import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { config as loadDotenv } from "dotenv";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

export function standaloneBackendDevCommand() {
  return {
    command: process.execPath,
    args: [
      "--import",
      "tsx",
      "apps/api/src/server.ts",
    ],
  };
}

export function backendDevEnv(inputEnv = process.env, options = {}) {
  const env = { ...inputEnv };

  env.PORT ??= "4100";
  if (options.databaseMode === "memory") {
    env.RESERVATION_PLATFORM_DATABASE_MODE = "memory";
    env.RESERVATION_WHATSAPP_ALLOW_MEMORY_STORE ??= "true";
    delete env.RESERVATION_SUPABASE_URL;
    delete env.RESERVATION_SUPABASE_ANON_KEY;
    delete env.RESERVATION_SUPABASE_SERVICE_ROLE_KEY;
    delete env.NEXT_PUBLIC_SUPABASE_URL;
    delete env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete env.SUPABASE_SERVICE_ROLE_KEY;
  } else {
    env.RESERVATION_SUPABASE_ANON_KEY ||= env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    env.RESERVATION_SUPABASE_SERVICE_ROLE_KEY ||= env.SUPABASE_SERVICE_ROLE_KEY;
    if (env.RESERVATION_SUPABASE_ANON_KEY || env.RESERVATION_SUPABASE_SERVICE_ROLE_KEY) {
      env.RESERVATION_SUPABASE_URL ||= env.LOCAL_RESERVATION_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:8000";
    }
  }
  env.RESERVATION_PLATFORM_CORS_ALLOWED_ORIGINS ||= [
    "http://localhost:4000",
    "http://127.0.0.1:4000",
    "http://localhost:4200",
    "http://127.0.0.1:4200",
    "http://localhost:4201",
    "http://127.0.0.1:4201",
    "http://localhost:4202",
    "http://127.0.0.1:4202",
    "http://localhost:4203",
    "http://127.0.0.1:4203",
    "http://localhost:4300",
    "http://127.0.0.1:4300",
    "http://localhost:4400",
    "http://127.0.0.1:4400",
  ].join(",");

  return env;
}

function describeBackendMode(env) {
  const hasSupabase = Boolean(
    env.RESERVATION_SUPABASE_URL
      && env.RESERVATION_SUPABASE_ANON_KEY
      && env.RESERVATION_SUPABASE_SERVICE_ROLE_KEY,
  );

  return hasSupabase
    ? "database-backed backend mode"
    : "skeleton mode; Supabase env is incomplete";
}

function main() {
  loadDotenv({ path: join(repoRoot, ".env") });

  const databaseMode = process.argv.includes("--memory") || process.argv.includes("--no-database")
    ? "memory"
    : "configured";
  const env = backendDevEnv(process.env, { databaseMode });
  const { command, args } = standaloneBackendDevCommand();

  console.log("Starting standalone reservation backend dev server.");
  console.log(`Backend origin: http://localhost:${env.PORT}`);
  console.log(`Backend mode: ${describeBackendMode(env)}`);
  if (databaseMode === "memory") {
    console.log("Database override: memory mode; Supabase env from .env is ignored for this dev server.");
  }
  console.log(`Backend CORS origins: ${env.RESERVATION_PLATFORM_CORS_ALLOWED_ORIGINS}`);
  console.log("Health check: GET /v1/health");

  const child = spawn(command, args, {
    cwd: repoRoot,
    env,
    stdio: "inherit",
    shell: false,
    windowsHide: true,
  });

  child.on("error", (error) => {
    console.error(`Failed to start standalone reservation backend dev server: ${error.message}`);
    process.exitCode = 1;
  });
  child.on("exit", (code, signal) => {
    process.exitCode = code ?? (signal ? 1 : 0);
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
