import assert from "node:assert/strict";
import { createHmac, timingSafeEqual } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  ensureLocalStackConfig,
  localStackConfigFileNames,
} from "./local-stack-config.mjs";

test("local stack config is generated once and remains stable", async () => {
  const directory = await mkdtemp(join(tmpdir(), "reservation-stack-config-"));
  const first = await ensureLocalStackConfig(directory);
  const second = await ensureLocalStackConfig(directory);

  assert.deepEqual(second, first);
  assert.notEqual(first.anonToken, first.serviceRoleToken);
  assert.match(first.apiEnv, /^RESERVATION_SUPABASE_URL=http:\/\/reservation-gateway$/mu);
  assert.match(first.apiEnv, /^RESERVATION_INSTALLATION_MASTER_KEY=\S+$/mu);
  assert.match(first.apiEnv, /^RESERVATION_SESSION_COOKIE_SECURE=false$/mu);
  assert.equal(first.installationMasterKey.length >= 32, true);
  assert.match(first.consoleEnv, /^RESERVATION_CONSOLE_TENANT_ID=final_demo$/mu);
  assert.match(first.bookingEnv, /^RESERVATION_PLATFORM_PUBLIC_BASE_URL=http:\/\/localhost:4100$/mu);

  for (const fileName of localStackConfigFileNames) {
    const file = await stat(join(directory, fileName));
    assert.equal(file.mode & 0o777, 0o600, `${fileName} must be private`);
  }
});

test("generated PostgREST tokens have valid distinct role claims", async () => {
  const directory = await mkdtemp(join(tmpdir(), "reservation-stack-jwt-"));
  const config = await ensureLocalStackConfig(directory);

  assertJwt(config.anonToken, config.jwtSecret, "anon");
  assertJwt(config.serviceRoleToken, config.jwtSecret, "service_role");
});

test("existing local stack config is upgraded with local authentication settings", async () => {
  const directory = await mkdtemp(join(tmpdir(), "reservation-stack-upgrade-"));
  const initial = await ensureLocalStackConfig(directory);
  await writeFile(
    join(directory, "api.env"),
    initial.apiEnv
      .replace(/^RESERVATION_INSTALLATION_MASTER_KEY=.*\n/mu, "")
      .replace(/^RESERVATION_SESSION_COOKIE_SECURE=.*\n/mu, ""),
    { mode: 0o600 },
  );

  const upgraded = await ensureLocalStackConfig(directory);
  assert.equal(upgraded.installationMasterKey.length >= 32, true);
  assert.match(upgraded.apiEnv, /^RESERVATION_INSTALLATION_MASTER_KEY=\S+$/mu);
  assert.match(upgraded.apiEnv, /^RESERVATION_SESSION_COOKIE_SECURE=false$/mu);
});

test("generated service files expose only the values each service needs", async () => {
  const directory = await mkdtemp(join(tmpdir(), "reservation-stack-scope-"));
  const config = await ensureLocalStackConfig(directory);

  assert.doesNotMatch(config.bookingEnv, /API_KEY|PASSWORD|SUPABASE|WHATSAPP/u);
  assert.doesNotMatch(config.consoleEnv, /SUPABASE|PASSWORD|WHATSAPP/u);
  assert.match(config.consoleEnv, /RESERVATION_PLATFORM_SERVICE_API_KEY=/u);
  assert.doesNotMatch(config.apiEnv, /DATABASE_PASSWORD|JWT_SECRET/u);

  const password = await readFile(join(directory, "database-password"), "utf8");
  assert.equal(password, config.databasePassword);
});

test("service config wrapper rejects invalid variable names without echoing values", async () => {
  const directory = await mkdtemp(join(tmpdir(), "reservation-stack-wrapper-"));
  const valid = join(directory, "valid.env");
  const invalid = join(directory, "invalid.env");
  await writeFile(valid, "SAFE_VALUE=private-value\n", { mode: 0o600 });
  await writeFile(invalid, "INVALID-NAME=private-value\n", { mode: 0o600 });
  const wrapper = new URL("../docker/local-stack/run-with-config.sh", import.meta.url);

  const validResult = spawnSync("sh", [wrapper.pathname, valid, "sh", "-c", 'printf %s "$SAFE_VALUE"'], { encoding: "utf8" });
  assert.equal(validResult.status, 0);
  assert.equal(validResult.stdout, "private-value");

  const invalidResult = spawnSync("sh", [wrapper.pathname, invalid, "true"], { encoding: "utf8" });
  assert.equal(invalidResult.status, 65);
  assert.doesNotMatch(invalidResult.stderr, /private-value/u);
});

function assertJwt(token, secret, expectedRole) {
  const segments = token.split(".");
  assert.equal(segments.length, 3);
  const [header, payload, signature] = segments;
  const decodedHeader = JSON.parse(Buffer.from(header, "base64url").toString("utf8"));
  const decodedPayload = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  assert.deepEqual(decodedHeader, { alg: "HS256", typ: "JWT" });
  assert.equal(decodedPayload.role, expectedRole);
  assert.equal(decodedPayload.iss, "reservation-local-stack");
  const expectedSignature = createHmac("sha256", secret).update(`${header}.${payload}`).digest();
  const actualSignature = Buffer.from(signature, "base64url");
  assert.equal(actualSignature.length, expectedSignature.length);
  assert.equal(timingSafeEqual(actualSignature, expectedSignature), true);
}
