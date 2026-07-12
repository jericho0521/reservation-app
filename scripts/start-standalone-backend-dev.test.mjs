import assert from "node:assert/strict";
import test from "node:test";
import { backendDevEnv } from "./start-standalone-backend-dev.mjs";

test("local backend permits every checked-in frontend development origin", () => {
  const origins = new Set(backendDevEnv({}).RESERVATION_PLATFORM_CORS_ALLOWED_ORIGINS.split(","));
  for (const port of [4000, 4200, 4201, 4202, 4203, 4300, 4400]) {
    assert.equal(origins.has(`http://localhost:${port}`), true);
    assert.equal(origins.has(`http://127.0.0.1:${port}`), true);
  }
});

test("explicit CORS configuration is never broadened", () => {
  const configured = "https://booking.example.test";
  assert.equal(backendDevEnv({ RESERVATION_PLATFORM_CORS_ALLOWED_ORIGINS: configured }).RESERVATION_PLATFORM_CORS_ALLOWED_ORIGINS, configured);
});
