import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getSetupLandingState } from "../app/setup/page.js";

test("setup landing accepts only a generated 32-byte base64url token shape", () => {
  const token = "A".repeat(43);
  assert.deepEqual(getSetupLandingState(token), {
    ready: true,
    heading: "Infrastructure is ready",
    detail: "Your secure production services are running. Owner account creation is the next setup step.",
  });

  for (const value of [undefined, "", "short", `${token}=`, `${token}/`, [token]]) {
    assert.deepEqual(getSetupLandingState(value), {
      ready: false,
      heading: "This setup link is invalid",
      detail: "Return to the server and use the one-time setup URL printed by the installer.",
    });
  }
});

test("setup landing state never returns the supplied token", () => {
  const token = "z".repeat(43);
  assert.doesNotMatch(JSON.stringify(getSetupLandingState(token)), new RegExp(token, "u"));
});

test("setup responses prevent token caching and referrer forwarding through Next and Caddy", async () => {
  const [nextConfig, caddy] = await Promise.all([
    readFile(new URL("../next.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../../../docker/production/Caddyfile", import.meta.url), "utf8"),
  ]);

  for (const source of ["/setup", "/invite/:path*", "/reset-password", "/reset-password/:path*"]) {
    assert.match(nextConfig, new RegExp(source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "u"));
  }
  assert.match(nextConfig, /key: "Referrer-Policy", value: "no-referrer"/u);
  assert.match(nextConfig, /key: "Cache-Control", value: "private, no-store"/u);
  assert.match(caddy, /\?Referrer-Policy "strict-origin-when-cross-origin"/u);
  assert.doesNotMatch(caddy, /^\s*Referrer-Policy "strict-origin-when-cross-origin"/mu);
});
