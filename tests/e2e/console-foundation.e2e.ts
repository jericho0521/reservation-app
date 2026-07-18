import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

test("console uses SDK with server-only platform configuration", async () => {
  const root = path.resolve("apps/console");
  const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
  };
  const clientSource = await readFile(path.join(root, "lib/platform-client.ts"), "utf8");
  const configSource = await readFile(path.join(root, "lib/platform-client-config.ts"), "utf8");

  assert.equal(packageJson.dependencies?.["@reservation-platform/sdk"], "workspace:*");
  assert.match(clientSource, /import "server-only"/u);
  assert.match(configSource, /RESERVATION_PLATFORM_BASE_URL/u);
  assert.doesNotMatch(configSource, /RESERVATION_PLATFORM_SERVICE_API_KEY/u);
  assert.doesNotMatch(`${clientSource}\n${configSource}`, /NEXT_PUBLIC_.*(?:KEY|SECRET|TOKEN)/u);
  assert.doesNotMatch(`${clientSource}\n${configSource}`, /@supabase\/supabase-js/u);
});

test("console responds when a live URL is configured", async (context) => {
  const url = process.env.RESERVATION_CONSOLE_E2E_BASE_URL;
  if (!url) {
    context.skip("Set RESERVATION_CONSOLE_E2E_BASE_URL for the live proof.");
    return;
  }

  const response = await fetch(new URL("/", url), {
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Overview|Experience Studio|setup required/iu);
});
