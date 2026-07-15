import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("channel console separates readiness states and uses the credential-free simulator", async () => {
  const [page, card, simulator, qrRoute, qrPanel, config] = await Promise.all([
    readFile(new URL("../app/channels/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/channels/readiness-card.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/channels/conversation-simulator.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/whatsapp/qr/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/channels/whatsapp-qr-panel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../next.config.ts", import.meta.url), "utf8"),
  ]);
  assert.match(card, /Configured/u);
  assert.match(page, /WhatsAppQrPanel/u);
  assert.match(qrRoute, /getWhatsAppSessionQr/u);
  assert.match(qrRoute, /private, no-store/u);
  assert.match(qrRoute, /Vary/u);
  assert.match(qrPanel, /cache:\s*"no-store"/u);
  assert.match(config, /\/api\/whatsapp\/qr/u);
  assert.match(simulator, /same conversation and booking orchestrator/u);
  assert.doesNotMatch(simulator, /fetch\(|sendDirectMessage/u);
});
