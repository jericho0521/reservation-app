#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { buildInstallationBootstrapSql } from "./production/bootstrap-installation.mjs";
import { assertLocalStackDatabaseTarget } from "./local-stack-seed.mjs";

export const LOCAL_SETUP_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const setupTokenPattern = /^[A-Za-z0-9_-]{43}$/u;

export function buildLocalProductBootstrapSql(input) {
  if (!setupTokenPattern.test(input.setupToken ?? "")) {
    throw new Error("Local product setup token is invalid.");
  }
  const setupTokenHash = createHash("sha256").update(input.setupToken).digest("hex");
  const bootstrapSql = buildInstallationBootstrapSql({
    installationId: input.installationId,
    domain: "reservation.localhost",
    setupTokenHash,
    setupExpiresAt: input.setupExpiresAt,
  });
  return `delete from public.venues
where id = '00000000-0000-0000-0000-000000000001'::uuid
  and tenant_id = 'platform_default'
  and name = 'Reservation Business'
  and not exists (
    select 1 from public.services
    where venue_id = '00000000-0000-0000-0000-000000000001'::uuid
  );

delete from public.tenants
where id = 'platform_default'
  and name = 'Reservation Platform'
  and not exists (
    select 1 from public.venues where tenant_id = 'platform_default'
  );

${bootstrapSql}
update public.platform_installation
set setup_token_hash = '${setupTokenHash}',
    setup_expires_at = '${new Date(input.setupExpiresAt).toISOString()}'::timestamptz
where singleton = true
  and id = '${input.installationId}'::uuid
  and tenant_id = '${input.installationId}'
  and domain = 'reservation.localhost'
  and setup_completed_at is null;
`;
}

export async function bootstrapLocalProduct(options = {}) {
  const env = options.env ?? process.env;
  const databaseUrl = env.RESERVATION_DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("RESERVATION_DATABASE_URL is required.");
  assertLocalStackDatabaseTarget(databaseUrl);
  if ((env.RESERVATION_STACK_MODE?.trim() || "product") !== "product") {
    throw new Error("Local product bootstrap requires product mode.");
  }
  const configDirectory = env.RESERVATION_STACK_CONFIG_DIR?.trim() || "/run/reservation-stack";
  const [mode, installationId, setupToken] = await Promise.all([
    readProtectedFile(path.join(configDirectory, "stack-mode")),
    readProtectedFile(path.join(configDirectory, "installation-id")),
    readProtectedFile(path.join(configDirectory, "setup-token")),
  ]);
  if (mode.trim() !== "product") {
    throw new Error("Local stack configuration is not a product installation.");
  }
  const now = options.now?.() ?? Date.now();
  if (!Number.isFinite(now)) throw new Error("Local product bootstrap clock is invalid.");
  const sql = buildLocalProductBootstrapSql({
    installationId: installationId.trim(),
    setupToken: setupToken.trim(),
    setupExpiresAt: new Date(now + LOCAL_SETUP_TOKEN_TTL_MS).toISOString(),
  });
  await (options.runPsql ?? runPsql)({ databaseUrl, sql });
  return { status: "ready" };
}

async function readProtectedFile(filePath) {
  const state = await lstat(filePath);
  if (!state.isFile() || state.isSymbolicLink() || (state.mode & 0o077) !== 0) {
    throw new Error(`Local stack ${path.basename(filePath)} must be a protected regular file.`);
  }
  return readFile(filePath, "utf8");
}

async function runPsql({ databaseUrl, sql }) {
  const result = spawnSync(
    "psql",
    ["--no-psqlrc", "--set", "ON_ERROR_STOP=1", "--single-transaction", "--dbname", databaseUrl, "--file", "-"],
    { encoding: "utf8", input: sql, stdio: ["pipe", "ignore", "pipe"] },
  );
  if (result.error || result.status !== 0) {
    throw new Error("Local product installation bootstrap failed.");
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  bootstrapLocalProduct().then(
    () => process.stdout.write("Local product installation is ready for owner setup.\n"),
    () => {
      process.stderr.write("Local product installation bootstrap failed.\n");
      process.exitCode = 1;
    },
  );
}
