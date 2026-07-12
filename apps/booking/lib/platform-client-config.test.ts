import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { readBookingPlatformConfig } from "./platform-client-config.js";

test("booking config accepts only the public API base URL", () => {
  assert.deepEqual(readBookingPlatformConfig({
    RESERVATION_PLATFORM_BASE_URL: " https://api.example ",
  }), { baseUrl: "https://api.example" });
  assert.throws(() => readBookingPlatformConfig({}), /RESERVATION_PLATFORM_BASE_URL/u);
});

test("booking platform client is server-only and contains no owner credential names", async () => {
  const source = await readFile(new URL("./platform-client.ts", import.meta.url), "utf8");
  assert.match(source, /import "server-only"/u);
  assert.doesNotMatch(source, /SERVICE_API_KEY|SERVICE_ROLE|SUPABASE|NEXT_PUBLIC_/u);
});
