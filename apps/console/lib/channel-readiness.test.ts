import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("channel console separates readiness states and uses the credential-free simulator", async () => {
  const [page, card, simulator] = await Promise.all([
    readFile(new URL("../app/channels/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/channels/readiness-card.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/channels/conversation-simulator.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(card, /Configured/u);
  assert.match(page, /getWhatsAppSessionQr/u);
  assert.match(simulator, /same conversation and booking orchestrator/u);
  assert.doesNotMatch(simulator, /fetch\(|sendDirectMessage/u);
});
