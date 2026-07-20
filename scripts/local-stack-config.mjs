#!/usr/bin/env node

import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { chmod, chown, lstat, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const localStackConfigFileNames = Object.freeze([
  "database-password",
  "installation-id",
  "setup-token",
  "stack-mode",
  "postgrest.conf",
  "api.env",
  "console.env",
  "booking.env",
  "stack.env",
]);

const containerOwners = Object.freeze({
  "database-password": 70,
  "installation-id": 1001,
  "setup-token": 1001,
  "stack-mode": 1001,
  "postgrest.conf": 1001,
  "api.env": 1001,
  "console.env": 1001,
  "booking.env": 1001,
  "stack.env": 1001,
});

export async function ensureLocalStackConfig(
  directory = process.env.RESERVATION_STACK_CONFIG_DIR?.trim() || "/run/reservation-stack",
  options = {},
) {
  const mode = normalizeStackMode(options.mode ?? process.env.RESERVATION_STACK_MODE);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const existing = await existingConfigFileNames(directory);
  if (existing.length === localStackConfigFileNames.length) {
    const existingMode = (await readFile(path.join(directory, "stack-mode"), "utf8")).trim();
    if (existingMode !== mode) {
      throw new Error(`Local stack configuration belongs to ${existingMode} mode; destroy that stack before starting ${mode} mode.`);
    }
    const apiEnvPath = path.join(directory, "api.env");
    let apiEnv = await readFile(apiEnvPath, "utf8");
    if (!/^RESERVATION_INSTALLATION_MASTER_KEY=\S+$/mu.test(apiEnv)) {
      apiEnv = `${apiEnv.trimEnd()}\nRESERVATION_INSTALLATION_MASTER_KEY=${randomSecret()}\n`;
    }
    if (!/^RESERVATION_SESSION_COOKIE_SECURE=\S+$/mu.test(apiEnv)) {
      apiEnv = `${apiEnv.trimEnd()}\nRESERVATION_SESSION_COOKIE_SECURE=false\n`;
    }
    if (apiEnv !== await readFile(apiEnvPath, "utf8")) {
      await writePrivateFile(
        directory,
        "api.env",
        apiEnv,
      );
    }
    if (options.applyContainerOwnership === true) {
      await applyContainerOwnership(directory);
    }
    return readLocalStackConfig(directory);
  }
  if (existing.length > 0) {
    throw new Error(`Local stack configuration is incomplete; found only: ${existing.join(", ")}.`);
  }

  const databasePassword = randomSecret();
  const jwtSecret = randomSecret();
  const serviceApiKey = randomSecret();
  const whatsappEncryptionKey = randomSecret();
  const installationMasterKey = randomSecret();
  const installationId = randomUUID();
  const setupToken = randomSecret();
  const anonToken = signLocalJwt({ role: "anon", iss: "reservation-local-stack" }, jwtSecret);
  const serviceRoleToken = signLocalJwt({ role: "service_role", iss: "reservation-local-stack" }, jwtSecret);
  const databaseUrl = `postgresql://postgres:${databasePassword}@reservation-db:5432/reservation`;

  const files = {
    "database-password": databasePassword,
    "installation-id": installationId,
    "setup-token": setupToken,
    "stack-mode": mode,
    "postgrest.conf": [
      `db-uri = "${databaseUrl}"`,
      'db-schemas = "public"',
      'db-anon-role = "anon"',
      `jwt-secret = "${jwtSecret}"`,
      "server-port = 3000",
      "server-host = \"0.0.0.0\"",
      "",
    ].join("\n"),
    "api.env": envFile({
      RESERVATION_SUPABASE_URL: "http://reservation-gateway",
      RESERVATION_SUPABASE_ANON_KEY: anonToken,
      RESERVATION_SUPABASE_SERVICE_ROLE_KEY: serviceRoleToken,
      RESERVATION_PLATFORM_SERVICE_API_KEY: serviceApiKey,
      RESERVATION_INSTALLATION_MASTER_KEY: installationMasterKey,
      RESERVATION_PLATFORM_CORS_ALLOWED_ORIGINS:
        "http://localhost:4300,http://127.0.0.1:4300,http://localhost:4400,http://127.0.0.1:4400",
      RESERVATION_SESSION_COOKIE_SECURE: "false",
      RESERVATION_WHATSAPP_ENABLED: "true",
      RESERVATION_WHATSAPP_PROVIDER: "session_qr",
      RESERVATION_WHATSAPP_SESSION_AUTH_DIR: "/app/.reservation-whatsapp-sessions",
      RESERVATION_WHATSAPP_SESSION_ENCRYPTION_KEY: whatsappEncryptionKey,
      RESERVATION_WHATSAPP_ALLOW_MEMORY_STORE: "false",
      RESERVATION_WHATSAPP_SIMULATION_ENABLED: mode === "demo" ? "true" : "false",
    }),
    "console.env": envFile({
      RESERVATION_PLATFORM_BASE_URL: "http://reservation-api:4100",
      RESERVATION_PLATFORM_SERVICE_API_KEY: serviceApiKey,
      ...(mode === "demo" ? {
        RESERVATION_CONSOLE_TENANT_ID: "final_demo",
        RESERVATION_CONSOLE_VENUE_ID: "00000000-0000-4000-8000-000000000101",
      } : {}),
    }),
    "booking.env": envFile({
      RESERVATION_PLATFORM_BASE_URL: "http://reservation-api:4100",
      RESERVATION_PLATFORM_PUBLIC_BASE_URL: "http://localhost:4100",
    }),
    "stack.env": envFile({
      RESERVATION_DATABASE_URL: databaseUrl,
      PGPASSWORD: databasePassword,
      RESERVATION_STACK_MODE: mode,
    }),
  };

  for (const fileName of localStackConfigFileNames) {
    await writePrivateFile(directory, fileName, files[fileName]);
  }

  if (options.applyContainerOwnership === true) {
    await applyContainerOwnership(directory);
  }

  return {
    databasePassword,
    jwtSecret,
    serviceApiKey,
    whatsappEncryptionKey,
    installationMasterKey,
    installationId,
    setupToken,
    mode,
    anonToken,
    serviceRoleToken,
    apiEnv: files["api.env"],
    consoleEnv: files["console.env"],
    bookingEnv: files["booking.env"],
    stackEnv: files["stack.env"],
    postgrestConfig: files["postgrest.conf"],
  };
}

export async function ensureLocalWhatsAppSessionDirectory(
  directory,
  options = {},
) {
  if (!directory || !path.isAbsolute(directory)) {
    throw new Error("Local WhatsApp session directory must be an absolute path.");
  }
  const userId = options.userId ?? 1001;
  const groupId = options.groupId ?? 1001;
  let entry;
  try {
    entry = await lstat(directory);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    await mkdir(directory, { recursive: true, mode: 0o700 });
    entry = await lstat(directory);
  }
  if (entry.isSymbolicLink() || !entry.isDirectory()) {
    throw new Error("Local WhatsApp session path must be a regular directory.");
  }
  await chown(directory, userId, groupId);
  await chmod(directory, 0o700);
}

export function signLocalJwt(payload, secret) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" }), "utf8").toString("base64url");
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
}

async function readLocalStackConfig(directory) {
  const databasePassword = await readFile(path.join(directory, "database-password"), "utf8");
  const installationId = (await readFile(path.join(directory, "installation-id"), "utf8")).trim();
  const setupToken = (await readFile(path.join(directory, "setup-token"), "utf8")).trim();
  const mode = normalizeStackMode((await readFile(path.join(directory, "stack-mode"), "utf8")).trim());
  const postgrestConfig = await readFile(path.join(directory, "postgrest.conf"), "utf8");
  const apiEnv = await readFile(path.join(directory, "api.env"), "utf8");
  const consoleEnv = await readFile(path.join(directory, "console.env"), "utf8");
  const bookingEnv = await readFile(path.join(directory, "booking.env"), "utf8");
  const stackEnv = await readFile(path.join(directory, "stack.env"), "utf8");
  const jwtSecret = readPostgrestValue(postgrestConfig, "jwt-secret");
  return {
    databasePassword,
    jwtSecret,
    serviceApiKey: readEnvValue(apiEnv, "RESERVATION_PLATFORM_SERVICE_API_KEY"),
    whatsappEncryptionKey: readEnvValue(apiEnv, "RESERVATION_WHATSAPP_SESSION_ENCRYPTION_KEY"),
    installationMasterKey: readEnvValue(apiEnv, "RESERVATION_INSTALLATION_MASTER_KEY"),
    installationId,
    setupToken,
    mode,
    anonToken: readEnvValue(apiEnv, "RESERVATION_SUPABASE_ANON_KEY"),
    serviceRoleToken: readEnvValue(apiEnv, "RESERVATION_SUPABASE_SERVICE_ROLE_KEY"),
    apiEnv,
    consoleEnv,
    bookingEnv,
    stackEnv,
    postgrestConfig,
  };
}

async function existingConfigFileNames(directory) {
  const existing = [];
  for (const fileName of localStackConfigFileNames) {
    try {
      await stat(path.join(directory, fileName));
      existing.push(fileName);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  return existing;
}

async function writePrivateFile(directory, fileName, value) {
  const target = path.join(directory, fileName);
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, value, { encoding: "utf8", mode: 0o600, flag: "wx" });
  await chmod(temporary, 0o600);
  await rename(temporary, target);
}

async function applyContainerOwnership(directory) {
  for (const [fileName, userId] of Object.entries(containerOwners)) {
    await chown(path.join(directory, fileName), userId, userId);
  }
}

function envFile(values) {
  return `${Object.entries(values).map(([name, value]) => `${name}=${value}`).join("\n")}\n`;
}

function randomSecret() {
  return randomBytes(32).toString("base64url");
}

function normalizeStackMode(value) {
  const mode = value?.trim() || "product";
  if (mode !== "product" && mode !== "demo") {
    throw new Error("RESERVATION_STACK_MODE must be product or demo.");
  }
  return mode;
}

function readEnvValue(source, name) {
  const value = source.match(new RegExp(`^${name}=(.+)$`, "mu"))?.[1];
  if (!value) throw new Error(`Generated local stack config is missing ${name}.`);
  return value;
}

function readPostgrestValue(source, name) {
  const value = source.match(new RegExp(`^${name} = "([^"]+)"$`, "mu"))?.[1];
  if (!value) throw new Error(`Generated PostgREST config is missing ${name}.`);
  return value;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await ensureLocalStackConfig(undefined, { applyContainerOwnership: process.getuid?.() === 0 });
    const sessionDirectory = process.env.RESERVATION_STACK_WHATSAPP_SESSION_DIR?.trim();
    if (sessionDirectory) {
      if (process.getuid?.() !== 0) {
        throw new Error("Local WhatsApp session directory initialization requires root.");
      }
      await ensureLocalWhatsAppSessionDirectory(sessionDirectory);
    }
    console.log("Local stack configuration is ready.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Local stack configuration failed.");
    process.exitCode = 1;
  }
}
