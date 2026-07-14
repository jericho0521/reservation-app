#!/usr/bin/env node

import { createHmac, randomBytes } from "node:crypto";
import { chmod, chown, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const localStackConfigFileNames = Object.freeze([
  "database-password",
  "postgrest.conf",
  "api.env",
  "console.env",
  "booking.env",
  "stack.env",
]);

const containerOwners = Object.freeze({
  "database-password": 70,
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
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const existing = await existingConfigFileNames(directory);
  if (existing.length === localStackConfigFileNames.length) {
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
  const anonToken = signLocalJwt({ role: "anon", iss: "reservation-local-stack" }, jwtSecret);
  const serviceRoleToken = signLocalJwt({ role: "service_role", iss: "reservation-local-stack" }, jwtSecret);
  const databaseUrl = `postgresql://postgres:${databasePassword}@reservation-db:5432/reservation`;

  const files = {
    "database-password": databasePassword,
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
      RESERVATION_PLATFORM_CORS_ALLOWED_ORIGINS:
        "http://localhost:4300,http://127.0.0.1:4300,http://localhost:4400,http://127.0.0.1:4400",
      RESERVATION_WHATSAPP_ENABLED: "true",
      RESERVATION_WHATSAPP_PROVIDER: "session_qr",
      RESERVATION_WHATSAPP_SESSION_AUTH_DIR: "/app/.reservation-whatsapp-sessions",
      RESERVATION_WHATSAPP_SESSION_ENCRYPTION_KEY: whatsappEncryptionKey,
      RESERVATION_WHATSAPP_ALLOW_MEMORY_STORE: "false",
      RESERVATION_WHATSAPP_SIMULATION_ENABLED: "true",
    }),
    "console.env": envFile({
      RESERVATION_PLATFORM_BASE_URL: "http://reservation-api:4100",
      RESERVATION_PLATFORM_SERVICE_API_KEY: serviceApiKey,
      RESERVATION_CONSOLE_TENANT_ID: "final_demo",
      RESERVATION_CONSOLE_VENUE_ID: "00000000-0000-4000-8000-000000000101",
    }),
    "booking.env": envFile({
      RESERVATION_PLATFORM_BASE_URL: "http://reservation-api:4100",
      RESERVATION_PLATFORM_PUBLIC_BASE_URL: "http://localhost:4100",
    }),
    "stack.env": envFile({
      RESERVATION_DATABASE_URL: databaseUrl,
      PGPASSWORD: databasePassword,
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
    anonToken,
    serviceRoleToken,
    apiEnv: files["api.env"],
    consoleEnv: files["console.env"],
    bookingEnv: files["booking.env"],
    stackEnv: files["stack.env"],
    postgrestConfig: files["postgrest.conf"],
  };
}

export function signLocalJwt(payload, secret) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" }), "utf8").toString("base64url");
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
}

async function readLocalStackConfig(directory) {
  const databasePassword = await readFile(path.join(directory, "database-password"), "utf8");
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
    console.log("Local stack configuration is ready.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Local stack configuration failed.");
    process.exitCode = 1;
  }
}
