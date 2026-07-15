#!/usr/bin/env node

import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

export const SETUP_TOKEN_TTL_MS = 60 * 60 * 1000;

const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const sha256Pattern = /^[a-f0-9]{64}$/u;
const setupTokenPattern = /^[A-Za-z0-9_-]{43,128}$/u;
const domainPattern = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;

function bootstrapError(message) {
  return new Error(`Installation bootstrap rejected: ${message}`);
}

export function buildInstallationBootstrapSql(input) {
  const installationId = requireInstallationId(input.installationId);
  const domain = requireDomain(input.domain);
  if (!sha256Pattern.test(input.setupTokenHash ?? "")) {
    throw bootstrapError("setup token hash is invalid");
  }
  const setupExpiresAt = requireTimestamp(input.setupExpiresAt);
  const desiredId = sqlLiteral(installationId);
  const desiredDomain = sqlLiteral(domain);
  const desiredTokenHash = sqlLiteral(input.setupTokenHash);
  const desiredExpiresAt = sqlLiteral(setupExpiresAt);

  return `do $reservation_installation_bootstrap$
declare
  desired_id uuid := ${desiredId}::uuid;
  desired_tenant_id text := ${desiredId};
  desired_domain text := ${desiredDomain};
  existing_id uuid;
  existing_tenant_id text;
  existing_domain text;
begin
  perform pg_advisory_xact_lock(hashtextextended('reservation-platform-installation-bootstrap', 0));

  select id, tenant_id, domain
  into existing_id, existing_tenant_id, existing_domain
  from public.platform_installation
  where singleton = true;

  if found then
    if existing_id <> desired_id
      or existing_tenant_id <> desired_tenant_id
      or existing_domain <> desired_domain then
      raise exception 'Existing installation identity or domain does not match protected configuration';
    end if;
  else
    insert into public.tenants (id, name)
    values (desired_tenant_id, desired_domain);

    insert into public.platform_installation (
      id,
      singleton,
      tenant_id,
      domain,
      setup_token_hash,
      setup_expires_at
    ) values (
      desired_id,
      true,
      desired_tenant_id,
      desired_domain,
      ${desiredTokenHash},
      ${desiredExpiresAt}::timestamptz
    );
  end if;
end
$reservation_installation_bootstrap$;
`;
}

export async function bootstrapInstallation(options) {
  let setupToken;
  try {
    const configDirectory = requireAbsoluteDirectory(options?.configDirectory);
    const databaseUrl = requireDatabaseUrl(options?.databaseUrl);
    const [releaseEnvironment, installationId, token] = await Promise.all([
      readProtectedFile(path.join(configDirectory, "release.env"), { allowWorldRead: true }),
      readProtectedFile(path.join(configDirectory, "installation-id")),
      readProtectedFile(path.join(configDirectory, "setup-token")),
    ]);
    setupToken = token.trim();
    if (!setupTokenPattern.test(setupToken)) throw bootstrapError("setup token is invalid");
    const domain = readReleaseDomain(releaseEnvironment);
    const now = options.now?.() ?? Date.now();
    if (!Number.isFinite(now)) throw bootstrapError("clock is invalid");
    const setupTokenHash = createHash("sha256").update(setupToken).digest("hex");
    const sql = buildInstallationBootstrapSql({
      installationId: installationId.trim(),
      domain,
      setupTokenHash,
      setupExpiresAt: new Date(now + SETUP_TOKEN_TTL_MS).toISOString(),
    });
    await (options.runPsql ?? runPsql)({ databaseUrl, sql });
    return { status: "ready" };
  } catch (error) {
    if (error instanceof Error && (!setupToken || !error.message.includes(setupToken))) {
      throw error;
    }
    throw new Error("Installation bootstrap failed.");
  }
}

export function formatBootstrapOutput(result) {
  if (result?.status !== "ready") throw bootstrapError("result is invalid");
  return "Installation bootstrap is ready.\n";
}

async function runPsql({ databaseUrl, sql }) {
  await new Promise((resolve, reject) => {
    const child = spawn("psql", [
      "--no-psqlrc",
      "--set", "ON_ERROR_STOP=1",
      "--single-transaction",
      "--dbname", databaseUrl,
      "--file", "-",
    ], { stdio: ["pipe", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      if (stderr.length < 8_192) stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (status) => {
      if (status === 0) resolve();
      else reject(new Error(`psql exited with status ${status}: ${stderr.slice(0, 8_192)}`));
    });
    child.stdin.end(sql);
  });
}

async function readProtectedFile(filePath, options = {}) {
  const state = await lstat(filePath);
  if (!state.isFile() || state.isSymbolicLink()) {
    throw bootstrapError(`${path.basename(filePath)} must be a regular protected file`);
  }
  const forbiddenMode = options.allowWorldRead ? 0o022 : 0o077;
  if ((state.mode & forbiddenMode) !== 0) {
    throw bootstrapError(`${path.basename(filePath)} must use protected file permissions`);
  }
  const handle = await open(filePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    return await handle.readFile("utf8");
  } finally {
    await handle.close();
  }
}

function readReleaseDomain(source) {
  const matches = source.match(/^RESERVATION_DOMAIN=([^\r\n]+)$/gmu) ?? [];
  if (matches.length !== 1) throw bootstrapError("release metadata domain is invalid");
  return requireDomain(matches[0].slice("RESERVATION_DOMAIN=".length));
}

function requireAbsoluteDirectory(value) {
  if (typeof value !== "string" || !path.isAbsolute(value) || path.normalize(value) !== value) {
    throw bootstrapError("configuration directory must be an absolute normalized path");
  }
  return value;
}

function requireDatabaseUrl(value) {
  if (typeof value !== "string" || !/^postgres(?:ql)?:\/\/[^\s]+$/u.test(value)) {
    throw bootstrapError("database URL is invalid");
  }
  return value;
}

function requireInstallationId(value) {
  if (typeof value !== "string" || !uuidPattern.test(value)) {
    throw bootstrapError("installation identifier is invalid");
  }
  return value;
}

function requireDomain(value) {
  if (typeof value !== "string" || !domainPattern.test(value)) {
    throw bootstrapError("domain is invalid");
  }
  return value;
}

function requireTimestamp(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw bootstrapError("setup expiry is invalid");
  }
  return new Date(value).toISOString();
}

function sqlLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

async function main() {
  const configDirectory = process.env.RESERVATION_PRODUCTION_CONFIG_DIR;
  const databaseUrl = process.env.RESERVATION_DATABASE_URL;
  const result = await bootstrapInstallation({ configDirectory, databaseUrl });
  process.stdout.write(formatBootstrapOutput(result));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    process.stderr.write("Installation bootstrap failed.\n");
    process.exitCode = 1;
  });
}
