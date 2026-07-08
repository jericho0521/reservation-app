import assert from "node:assert/strict";
import test from "node:test";

import { parsePlatformRuntimeConfig, PlatformRuntimeConfigError } from "./index.js";

test("platform config normalizes a racing simulator backend manifest", () => {
  const config = parsePlatformRuntimeConfig({
    version: 1,
    app: "racing-sim",
    modules: {
      reservations: { enabled: true },
      ai: {
        enabled: true,
        provider: "openai-compatible",
        baseUrl: "https://openrouter.ai/api/v1",
        model: "openai/gpt-4.1-mini",
      },
      whatsapp: {
        enabled: true,
        automation: {
          enabled: true,
        },
      },
    },
  });

  assert.equal(config.modules.whatsapp.provider, "session_qr");
  assert.equal(config.modules.whatsapp.automation.mode, "booking_assistant");
  assert.equal(config.modules.whatsapp.automation.staffTakeover.enabled, true);
  assert.equal(config.modules.inAppChat.enabled, false);
});

test("platform config rejects unknown modules and secret-like keys", () => {
  assert.throws(
    () => parsePlatformRuntimeConfig({
      version: 1,
      app: "bad",
      modules: {
        payments: { enabled: true },
        ai: { enabled: true, apiKey: "secret" },
      },
    }),
    (error) => {
      assert.equal(error instanceof PlatformRuntimeConfigError, true);
      assert.match((error as Error).message, /unknown module "payments"/u);
      assert.match((error as Error).message, /apiKey/u);
      return true;
    },
  );
});

test("platform config validates module dependencies", () => {
  assert.throws(
    () => parsePlatformRuntimeConfig({
      version: 1,
      app: "bad",
      modules: {
        whatsapp: { enabled: true, automation: { enabled: true } },
      },
    }),
    /requires modules.ai.enabled=true/u,
  );
});
