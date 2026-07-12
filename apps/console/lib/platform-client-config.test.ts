import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { readConsolePlatformConfig } from "./platform-client-config.js";

test("console config reads the complete server-only platform scope", () => {
  assert.deepEqual(readConsolePlatformConfig({
    RESERVATION_PLATFORM_BASE_URL: "https://api.example",
    RESERVATION_PLATFORM_SERVICE_API_KEY: "server-secret",
    RESERVATION_CONSOLE_TENANT_ID: "tenant_1",
    RESERVATION_CONSOLE_VENUE_ID: "venue_1",
  }), {
    baseUrl: "https://api.example",
    apiKey: "server-secret",
    tenantId: "tenant_1",
    venueId: "venue_1",
  });
});

test("console config fails closed for incomplete server config", () => {
  assert.throws(() => readConsolePlatformConfig({}), /RESERVATION_PLATFORM_BASE_URL/);
});

test("platform client module is guarded as server-only", async () => {
  const source = await readFile(new URL("./platform-client.ts", import.meta.url), "utf8");
  assert.match(source, /import "server-only"/u);
  assert.doesNotMatch(source, /NEXT_PUBLIC_/u);
});
