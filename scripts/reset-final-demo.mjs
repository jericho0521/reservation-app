#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const finalDemoSeedPath = path.join(repoRoot, "packages/database/seeds/final-demo.sql");

export function parseFinalDemoResetConfig(env = process.env) {
  const databaseUrl = env.FINAL_DEMO_DATABASE_URL?.trim() || env.RESERVATION_DATABASE_URL?.trim();
  const allowHosts = new Set((env.RESERVATION_DEMO_RESET_ALLOW_HOSTS ?? "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean));
  return { databaseUrl, allowHosts, confirmed: env.RESERVATION_DEMO_RESET_CONFIRM === "RESET_FINAL_DEMO" };
}

export function assertSafeFinalDemoReset(config) {
  if (!config.databaseUrl) return { mode: "static" };
  let parsed;
  try { parsed = new URL(config.databaseUrl); } catch { throw new Error("FINAL_DEMO_DATABASE_URL must be a valid PostgreSQL URL."); }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") throw new Error("Final demo reset requires a PostgreSQL URL.");
  const host = parsed.hostname.toLowerCase();
  const local = host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
  if (!local && !config.allowHosts.has(host)) throw new Error(`Refusing final demo reset for non-local, non-allowlisted host: ${host}`);
  if (!config.confirmed) throw new Error("Set RESERVATION_DEMO_RESET_CONFIRM=RESET_FINAL_DEMO to authorize the destructive reset.");
  return { mode: "database", databaseUrl: config.databaseUrl };
}

export function runFinalDemoReset(env = process.env) {
  const safe = assertSafeFinalDemoReset(parseFinalDemoResetConfig(env));
  const seed = readFileSync(finalDemoSeedPath, "utf8");
  if (safe.mode === "static") {
    console.log("Final demo seed validated. No database URL was supplied, so no destructive reset was performed.");
    return;
  }
  const result = spawnSync(env.PSQL_BIN?.trim() || "psql", [safe.databaseUrl, "--set", "ON_ERROR_STOP=1", "--no-psqlrc"], { input: seed, encoding: "utf8", stdio: ["pipe", "inherit", "inherit"] });
  if (result.error) throw new Error(`Unable to run psql: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`Final demo reset failed with exit code ${result.status}.`);
  console.log("Final demo database reset complete.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { runFinalDemoReset(); } catch (error) { console.error(error instanceof Error ? error.message : "Final demo reset failed."); process.exitCode = 1; }
}
