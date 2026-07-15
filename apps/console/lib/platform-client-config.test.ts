import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { readConsolePlatformConfig } from "./platform-client-config.js";

test("console config requires only the internal API URL", () => {
  assert.deepEqual(readConsolePlatformConfig({
    RESERVATION_PLATFORM_BASE_URL: "http://reservation-api:4100",
  }), {
    baseUrl: "http://reservation-api:4100",
  });
});

test("console config fails closed for incomplete server config", () => {
  assert.throws(() => readConsolePlatformConfig({}), /RESERVATION_PLATFORM_BASE_URL/);
});

test("platform client module is guarded as server-only", async () => {
  const source = await readFile(new URL("./platform-client.ts", import.meta.url), "utf8");
  assert.match(source, /import "server-only"/u);
  assert.match(source, /headers: async/u);
  assert.match(source, /buildPlatformForwardHeaders/u);
  assert.match(source, /buildInternalApiFetchInit/u);
  assert.doesNotMatch(source, /NEXT_PUBLIC_/u);
  assert.doesNotMatch(source, /SERVICE_API_KEY|CONSOLE_TENANT_ID|CONSOLE_VENUE_ID/u);
});
