import assert from "node:assert/strict";
import test from "node:test";

import {
  backendDevEnv,
  defaultBackendPort,
  defaultFrontendPort,
  formatLocalPlatformDevErrors,
  frontendDevEnv,
  readLocalPlatformDevConfig,
} from "./dev-platform-config.mjs";

test("local platform dev config defaults to health-only backend with clear ports", () => {
  const config = readLocalPlatformDevConfig({}, []);

  assert.equal(config.ok, true);
  assert.equal(config.frontendPort, defaultFrontendPort);
  assert.equal(config.backendPort, defaultBackendPort);
  assert.equal(config.frontendOrigin, "http://localhost:4000");
  assert.equal(config.backendOrigin, "http://127.0.0.1:4100");
  assert.equal(config.healthOnly, true);
});

test("local platform dev config rejects partial Supabase backend env", () => {
  const config = readLocalPlatformDevConfig({
    RESERVATION_SUPABASE_URL: "https://example.supabase.co",
  }, []);

  assert.equal(config.ok, false);
  assert.match(formatLocalPlatformDevErrors(config), /RESERVATION_SUPABASE_ANON_KEY/u);
  assert.match(formatLocalPlatformDevErrors(config), /RESERVATION_SUPABASE_SERVICE_ROLE_KEY/u);
});

test("local platform dev config rejects frontend port overrides that scripts cannot honor", () => {
  const config = readLocalPlatformDevConfig({ NEXT_PORT: "4001" }, []);

  assert.equal(config.ok, false);
  assert.match(formatLocalPlatformDevErrors(config), /fixed frontend port 4000/u);
});

test("local platform dev config rejects optional JWT auth env without required trio", () => {
  const config = readLocalPlatformDevConfig({
    RESERVATION_PLATFORM_AUTH_ALGORITHMS: "RS256",
  }, []);

  assert.equal(config.ok, false);
  assert.match(formatLocalPlatformDevErrors(config), /RESERVATION_PLATFORM_AUTH_JWKS_URL/u);
  assert.match(formatLocalPlatformDevErrors(config), /RESERVATION_PLATFORM_AUTH_ISSUER/u);
  assert.match(formatLocalPlatformDevErrors(config), /RESERVATION_PLATFORM_AUTH_AUDIENCE/u);
});

test("dev env helpers wire backend CORS and frontend platform mode", () => {
  const config = readLocalPlatformDevConfig({
    RESERVATION_SUPABASE_URL: "https://example.supabase.co",
    RESERVATION_SUPABASE_ANON_KEY: "anon",
    RESERVATION_SUPABASE_SERVICE_ROLE_KEY: "service",
  }, []);

  assert.equal(config.healthOnly, false);
  assert.equal(backendDevEnv(config, {}).PORT, "4100");
  assert.equal(backendDevEnv(config, {}).RESERVATION_PLATFORM_CORS_ALLOWED_ORIGINS, "http://localhost:4000,http://127.0.0.1:4000");
  assert.equal(frontendDevEnv(config, {}).NEXT_PUBLIC_RESERVATION_API_MODE, "platform");
  assert.equal(frontendDevEnv(config, {}).NEXT_PUBLIC_RESERVATION_CHAT_MODE, "platform");
  assert.equal(frontendDevEnv(config, {}).NEXT_PUBLIC_RESERVATION_PLATFORM_BASE_URL, "http://127.0.0.1:4100");
});
