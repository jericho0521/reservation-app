import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { readBookingPlatformConfig } from "./platform-client-config.js";

test("booking config separates the server and browser API origins", () => {
  assert.deepEqual(readBookingPlatformConfig({
    RESERVATION_PLATFORM_BASE_URL: " http://reservation-api:4100 ",
    RESERVATION_PLATFORM_PUBLIC_BASE_URL: " http://localhost:4100 ",
  }), {
    serverBaseUrl: "http://reservation-api:4100",
    publicBaseUrl: "http://localhost:4100",
  });
  assert.deepEqual(readBookingPlatformConfig({
    RESERVATION_PLATFORM_BASE_URL: " https://api.example ",
  }), {
    serverBaseUrl: "https://api.example",
    publicBaseUrl: "https://api.example",
  });
  assert.throws(() => readBookingPlatformConfig({}), /RESERVATION_PLATFORM_BASE_URL/u);
});

test("booking platform client is server-only and contains no owner credential names", async () => {
  const source = await readFile(new URL("./platform-client.ts", import.meta.url), "utf8");
  assert.match(source, /import "server-only"/u);
  assert.doesNotMatch(source, /SERVICE_API_KEY|SERVICE_ROLE|SUPABASE|NEXT_PUBLIC_/u);
});
