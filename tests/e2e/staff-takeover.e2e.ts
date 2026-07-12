import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { WhatsAppBusinessModule } from "../../packages/whatsapp/src/module.ts";

test("manual takeover suppresses simulated channel delivery and exposes no sensitive diagnostics", async () => {
  let delivered = false;
  const module = new WhatsAppBusinessModule({ enabled: true, sessionAdapter: { async sendMessage() { delivered = true; } }, unifiedConversations: { async handleInbound() { return { conversation_id: "conversation_manual", content: "must not send", automation_suppressed: true }; } } });
  const result = await module.handleInboundMessage({ provider: "session_qr", messageId: "takeover-1", from: { id: "demo@s.whatsapp.net" }, text: "Hello", raw: { simulated: true } });
  assert.equal(result.automation_suppressed, true);
  assert.equal(delivered, false);
  assert.doesNotMatch(JSON.stringify(result), /qr|credential|token/iu);
});

test("owner staff reply path pauses automation before channel delivery and persistence", async () => {
  const source = await readFile("packages/reservation-platform-api/src/conversations.ts", "utf8");
  const takeover = source.indexOf("updateAutomation(input.scope");
  const delivery = source.indexOf("input.deliver?.");
  const persistence = source.indexOf("return appendConversationMessage");
  assert.equal(takeover >= 0 && delivery > takeover && persistence > delivery, true);
});
