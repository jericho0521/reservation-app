#!/usr/bin/env node

import { createHash, createHmac, randomBytes as nodeRandomBytes, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  unlink,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SECRET_FILE_NAMES = Object.freeze([
  "database-password",
  "postgrest-jwt-secret",
  "postgrest-anon-token",
  "postgrest-service-token",
  "browser-session-secret",
  "internal-service-key",
  "installation-master-key",
  "whatsapp-session-key",
  "backup-recovery-key",
  "setup-token",
]);

export const PRODUCTION_IMAGE_REGISTRY = "ghcr.io/jericho0521";

export const PRODUCTION_IMAGE_NAMES = Object.freeze({
  api: "reservation-app-api",
  worker: "reservation-app-worker",
  console: "reservation-app-console",
  booking: "reservation-app-booking",
  tools: "reservation-app-tools",
});

export const POSTGREST_TOKEN_TTL_SECONDS = 10 * 365 * 24 * 60 * 60;

const RELEASE_ENV_FILE = "release.env";
const INSTALLATION_ID_FILE = "installation-id";
const SECRET_BYTES = 32;
const BASE64URL_SECRET = /^[A-Za-z0-9_-]{43}$/u;
const UUID_V4 = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const SEMVER_TAG = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/u;
const DNS_LABEL = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)$/u;

function configurationError(message) {
  return new Error(`Production configuration rejected: ${message}`);
}

export function validateProductionDomain(value) {
  if (typeof value !== "string" || value.length > 253 || !value.includes(".") || value !== value.toLowerCase()) {
    throw configurationError("domain must be a normalized ASCII DNS name");
  }
  if (!/^[\x00-\x7F]+$/u.test(value) || /[/:@*\[\]]/u.test(value)) {
    throw configurationError("domain must be a normalized ASCII DNS name");
  }
  const labels = value.split(".");
  if (labels.some((label) => !DNS_LABEL.test(label)) || /^\d+$/u.test(labels.at(-1) ?? "")) {
    throw configurationError("domain must be a normalized ASCII DNS name");
  }
  return value;
}

export function validateReleaseTag(value) {
  const prerelease = typeof value === "string" ? value.split("-", 2)[1] : undefined;
  const invalidNumericPrerelease = prerelease?.split(".").some(
    (identifier) => /^\d+$/u.test(identifier) && identifier.length > 1 && identifier.startsWith("0"),
  );
  if (typeof value !== "string" || !SEMVER_TAG.test(value) || invalidNumericPrerelease) {
    throw configurationError("release must be an exact immutable release tag");
  }
  return value;
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function encodeJwt(payload, signingKey) {
  const encodedHeader = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const input = `${encodedHeader}.${encodedPayload}`;
  const signature = createHmac("sha256", signingKey).update(input).digest("base64url");
  return `${input}.${signature}`;
}

function decodeAndVerifyJwt(token, signingKey, expectedRole, currentSeconds) {
  const parts = token.split(".");
  if (parts.length !== 3) throw configurationError("an existing PostgREST token is invalid");
  const [encodedHeader, encodedPayload, signature] = parts;
  let header;
  let payload;
  try {
    header = JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8"));
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    throw configurationError("an existing PostgREST token is invalid");
  }
  const expectedSignature = createHmac("sha256", signingKey)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest("base64url");
  const validTimes = Number.isSafeInteger(payload.iat)
    && Number.isSafeInteger(payload.exp)
    && payload.iat <= currentSeconds + 300
    && payload.exp > currentSeconds
    && payload.exp - payload.iat === POSTGREST_TOKEN_TTL_SECONDS;
  if (
    header.alg !== "HS256"
    || header.typ !== "JWT"
    || signature !== expectedSignature
    || payload.role !== expectedRole
    || payload.iss !== "reservation-platform"
    || payload.aud !== "postgrest"
    || !BASE64URL_SECRET.test(payload.jti ?? "")
    || !validTimes
  ) {
    throw configurationError("an existing PostgREST token is invalid");
  }
}

async function pathState(filePath) {
  try {
    return await lstat(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

async function fsyncDirectory(directory) {
  const handle = await open(directory, constants.O_RDONLY | (constants.O_DIRECTORY ?? 0));
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function writeFileAtomically(filePath, value, options = {}) {
  const directory = path.dirname(filePath);
  const name = path.basename(filePath);
  const mode = options.mode ?? 0o600;
  const temporaryPath = path.join(directory, `.${name}.${process.pid}.${randomUUID()}.tmp`);
  let handle;
  try {
    handle = await open(
      temporaryPath,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0),
      mode,
    );
    await handle.writeFile(value, { encoding: "utf8" });
    await handle.sync();
    await handle.close();
    handle = undefined;
    await options.beforeRename?.(temporaryPath, filePath);
    if (await pathState(filePath)) throw configurationError(`refusing to replace existing file ${name}`);
    await rename(temporaryPath, filePath);
    await chmod(filePath, mode);
    await fsyncDirectory(directory);
  } finally {
    await handle?.close().catch(() => undefined);
    await unlink(temporaryPath).catch((error) => {
      if (error?.code !== "ENOENT") throw error;
    });
  }
}

async function assertNoSymbolicLinkAncestor(directory) {
  const parsed = path.parse(directory);
  const segments = directory.slice(parsed.root.length).split(path.sep).filter(Boolean);
  let current = parsed.root;
  for (const segment of segments) {
    current = path.join(current, segment);
    const state = await pathState(current);
    if (!state) return;
    if (state.isSymbolicLink()) {
      throw configurationError("configuration path must not contain a symbolic link");
    }
  }
}

async function prepareConfigurationDirectory(directory) {
  await assertNoSymbolicLinkAncestor(directory);
  const existing = await pathState(directory);
  if (existing?.isSymbolicLink()) throw configurationError("configuration directory must not be a symbolic link");
  if (existing && !existing.isDirectory()) throw configurationError("configuration path must be a directory");
  if (!existing) await mkdir(directory, { recursive: true, mode: 0o700 });
  await assertNoSymbolicLinkAncestor(directory);
  const prepared = await lstat(directory);
  if (prepared.isSymbolicLink() || !prepared.isDirectory()) {
    throw configurationError("configuration directory must be a regular directory, not a symbolic link");
  }
  if ((prepared.mode & 0o777) !== 0o700) {
    if (existing) throw configurationError("existing configuration directory must use mode 0700");
    await chmod(directory, 0o700);
  }
}

function buildReleaseEnvironment(domain, release) {
  const lines = [
    `RESERVATION_DOMAIN=${domain}`,
    `RESERVATION_RELEASE=${release}`,
  ];
  for (const [component, imageName] of Object.entries(PRODUCTION_IMAGE_NAMES)) {
    lines.push(`RESERVATION_${component.toUpperCase()}_IMAGE=${PRODUCTION_IMAGE_REGISTRY}/${imageName}:${release}`);
  }
  return `${lines.join("\n")}\n`;
}

async function readProtectedRegularFile(filePath, expectedMode) {
  const name = path.basename(filePath);
  const state = await lstat(filePath);
  if (state.isSymbolicLink()) throw configurationError(`existing file ${name} must not be a symbolic link`);
  if (!state.isFile()) throw configurationError(`existing file ${name} must be a regular file`);
  if ((state.mode & 0o777) !== expectedMode) {
    throw configurationError(`existing file ${name} must use mode ${expectedMode.toString(8).padStart(4, "0")}`);
  }
  const handle = await open(filePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    return await handle.readFile("utf8");
  } finally {
    await handle.close();
  }
}

function assertEncodedSecret(value, name) {
  if (!BASE64URL_SECRET.test(value) || Buffer.from(value, "base64url").byteLength !== SECRET_BYTES) {
    throw configurationError(`existing file ${name} is invalid`);
  }
}

function assertInstallationId(value) {
  if (!UUID_V4.test(value)) {
    throw configurationError(`existing file ${INSTALLATION_ID_FILE} is invalid`);
  }
}

async function inspectExistingConfiguration({ directory, domain, release, currentSeconds }) {
  const expectedPaths = [...SECRET_FILE_NAMES, INSTALLATION_ID_FILE, RELEASE_ENV_FILE].map((name) => path.join(directory, name));
  const states = await Promise.all(expectedPaths.map(pathState));
  const presentCount = states.filter(Boolean).length;
  const directoryEntries = await readdir(directory);
  if (presentCount === 0 && directoryEntries.length === 0) return undefined;
  if (presentCount !== expectedPaths.length) {
    throw configurationError("partial production configuration exists; restore it or choose an empty directory");
  }
  const expectedNames = new Set([...SECRET_FILE_NAMES, INSTALLATION_ID_FILE, RELEASE_ENV_FILE]);
  if (directoryEntries.some((name) => !expectedNames.has(name))) {
    throw configurationError("production configuration directory contains an unexpected file");
  }

  const values = Object.fromEntries(
    await Promise.all(
      SECRET_FILE_NAMES.map(async (name) => [name, await readProtectedRegularFile(path.join(directory, name), 0o600)]),
    ),
  );
  const installationId = await readProtectedRegularFile(path.join(directory, INSTALLATION_ID_FILE), 0o600);
  assertInstallationId(installationId);
  const releaseEnvironment = await readProtectedRegularFile(path.join(directory, RELEASE_ENV_FILE), 0o644);
  if (releaseEnvironment !== buildReleaseEnvironment(domain, release)) {
    throw configurationError("existing release metadata does not match the requested domain and release");
  }

  for (const name of SECRET_FILE_NAMES) {
    if (name !== "postgrest-anon-token" && name !== "postgrest-service-token") {
      assertEncodedSecret(values[name], name);
    }
  }
  const signingKey = values["postgrest-jwt-secret"];
  decodeAndVerifyJwt(values["postgrest-anon-token"], signingKey, "anon", currentSeconds);
  decodeAndVerifyJwt(values["postgrest-service-token"], signingKey, "service_role", currentSeconds);
  return { values, installationId, releaseEnvironment };
}

function safeResult({ created, domain, release, values, releaseEnvironment }) {
  const secretDigests = Object.fromEntries(
    SECRET_FILE_NAMES.map((name) => [name, digest(values[name])]),
  );
  const stdout = JSON.stringify({
    status: "ready",
    created,
    domain,
    release,
    protectedValues: { present: SECRET_FILE_NAMES.length, digests: Object.values(secretDigests) },
    releaseMetadataDigest: digest(releaseEnvironment),
  });
  return {
    created,
    domain,
    release,
    secretDigests,
    releaseEnvironmentDigest: digest(releaseEnvironment),
    backupRecovery: { present: true, policy: "backup-restore-only" },
    stdout,
  };
}

export async function configureProduction(options) {
  const directory = options?.directory;
  if (
    typeof directory !== "string"
    || directory.length === 0
    || !path.isAbsolute(directory)
    || path.normalize(directory) !== directory
  ) {
    throw configurationError("configuration directory must be a normalized absolute path");
  }
  const domain = validateProductionDomain(options.domain);
  const release = validateReleaseTag(options.release);
  const randomBytes = options.randomBytes ?? nodeRandomBytes;
  const uuidFactory = options.randomUUID ?? randomUUID;
  const now = options.now ?? Date.now;
  const currentSeconds = Math.floor(now() / 1000);
  await prepareConfigurationDirectory(directory);

  const existing = await inspectExistingConfiguration({ directory, domain, release, currentSeconds });
  if (existing) {
    return safeResult({ created: false, domain, release, ...existing });
  }

  const entropy = Object.fromEntries(
    SECRET_FILE_NAMES.map((name) => {
      const value = randomBytes(SECRET_BYTES);
      if (!Buffer.isBuffer(value) || value.byteLength !== SECRET_BYTES) {
        throw configurationError("secure random source must return exactly 32 bytes");
      }
      return [name, Buffer.from(value)];
    }),
  );
  const issuedAt = currentSeconds;
  const expiresAt = issuedAt + POSTGREST_TOKEN_TTL_SECONDS;
  const values = Object.fromEntries(
    SECRET_FILE_NAMES.map((name) => [name, entropy[name].toString("base64url")]),
  );
  const installationId = uuidFactory();
  assertInstallationId(installationId);
  const signingKey = values["postgrest-jwt-secret"];
  values["postgrest-anon-token"] = encodeJwt({
    role: "anon",
    iss: "reservation-platform",
    aud: "postgrest",
    iat: issuedAt,
    exp: expiresAt,
    jti: entropy["postgrest-anon-token"].toString("base64url"),
  }, signingKey);
  values["postgrest-service-token"] = encodeJwt({
    role: "service_role",
    iss: "reservation-platform",
    aud: "postgrest",
    iat: issuedAt,
    exp: expiresAt,
    jti: entropy["postgrest-service-token"].toString("base64url"),
  }, signingKey);

  for (const name of SECRET_FILE_NAMES) {
    await writeFileAtomically(path.join(directory, name), values[name], { mode: 0o600 });
  }
  await writeFileAtomically(path.join(directory, INSTALLATION_ID_FILE), installationId, { mode: 0o600 });
  const releaseEnvironment = buildReleaseEnvironment(domain, release);
  await writeFileAtomically(path.join(directory, RELEASE_ENV_FILE), releaseEnvironment, { mode: 0o644 });
  return safeResult({ created: true, domain, release, values, releaseEnvironment });
}

function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag !== "--domain" && flag !== "--release") throw new Error("Usage: configure.mjs --domain <dns-name> --release <semver>");
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error("Usage: configure.mjs --domain <dns-name> --release <semver>");
    values[flag.slice(2)] = value;
    index += 1;
  }
  if (!values.domain || !values.release) throw new Error("Usage: configure.mjs --domain <dns-name> --release <semver>");
  return values;
}

async function main() {
  const { domain, release } = parseArguments(process.argv.slice(2));
  const directory = process.env.RESERVATION_PRODUCTION_CONFIG_DIR;
  if (!directory) throw new Error("RESERVATION_PRODUCTION_CONFIG_DIR is required");
  const result = await configureProduction({ directory, domain, release });
  process.stdout.write(`${result.stdout}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Production configuration failed"}\n`);
    process.exitCode = 1;
  });
}
