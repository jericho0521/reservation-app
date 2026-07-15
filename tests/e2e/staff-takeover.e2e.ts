import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { describeWhatsAppSession } from "../../apps/console/lib/channel-page-state.ts";
import { deliveryStatePresentation } from "../../apps/console/lib/conversation-view.ts";
import { WhatsAppBusinessModule } from "../../packages/whatsapp/src/module.ts";

test("manual takeover suppresses simulated channel delivery and exposes no sensitive diagnostics", async () => {
  let delivered = false;
  const module = new WhatsAppBusinessModule({ enabled: true, sessionAdapter: { async sendMessage() { delivered = true; } }, unifiedConversations: { async handleInbound() { return { conversation_id: "conversation_manual", content: "must not send", automation_suppressed: true }; } } });
  const result = await module.handleInboundMessage({ provider: "session_qr", messageId: "takeover-1", from: { id: "demo@s.whatsapp.net" }, text: "Hello", raw: { simulated: true } });
  assert.equal(result.automation_suppressed, true);
  assert.equal(delivered, false);
  assert.doesNotMatch(JSON.stringify(result), /qr|credential|token/iu);
});

test("owner WhatsApp staff reply path uses one atomic takeover, persistence, and outbox operation", async () => {
  const source = await readFile("packages/reservation-platform-api/src/conversations.ts", "utf8");
  const atomicOutbox = source.indexOf("appendStaffReplyWithOutbox(input.scope");
  const legacyTakeover = source.indexOf("updateAutomation(input.scope");
  assert.equal(atomicOutbox >= 0 && legacyTakeover > atomicOutbox, true);
  const migration = await readFile("packages/database/migrations/supabase/000034_channel_runtime.sql", "utf8");
  assert.match(migration, /platform_append_whatsapp_staff_reply/u);
  assert.match(migration, /automation_state = 'manual'/u);
  assert.match(migration, /whatsapp\.deliver_outbound/u);
});

test("credential-free pairing simulation reaches QR, connected, reconnecting, degraded, and expired UX", () => {
  const readiness = {
    enabled: true,
    provider: "session_qr" as const,
    simulation_enabled: true,
    production_ready: true,
    missing_requirements: [],
    ai: { configured: true, connected: true, healthy: true, message: "Ready." },
    whatsapp: { configured: true, connected: true, healthy: true, message: "Ready." },
  };
  const session = { provider: "session_qr" as const, status: "pending_qr" as const, updated_at: "2026-07-15T00:00:00.000Z" };
  const sequence = [
    describeWhatsAppSession(readiness, session, false).state,
    describeWhatsAppSession(readiness, session, true).state,
    describeWhatsAppSession(readiness, { ...session, status: "connected" }, false).state,
    describeWhatsAppSession(readiness, { ...session, status: "connected", metadata: { connection_state: "reconnecting" } }, false).state,
    describeWhatsAppSession({ ...readiness, production_ready: false, whatsapp: { ...readiness.whatsapp, healthy: false, message: "Provider is unavailable." } }, { ...session, status: "connected" }, false).state,
    describeWhatsAppSession(readiness, { ...session, status: "expired" }, false).state,
  ];
  assert.deepEqual(sequence, ["pairing", "qr", "connected", "reconnecting", "degraded", "expired"]);
});

test("unified inbox simulation exposes durable outbox progression and failure", () => {
  assert.deepEqual(["pending", "sent", "delivered", "failed"].map((state) =>
    deliveryStatePresentation(state as "pending" | "sent" | "delivered" | "failed").label,
  ), ["Queued", "Sent", "Delivered", "Delivery failed"]);
});

test("private QR console proxy is no-store and returns no session metadata", async () => {
  const source = await readFile("apps/console/app/api/whatsapp/qr/route.ts", "utf8");
  assert.match(source, /private, no-store/u);
  assert.match(source, /Vary:\s*"Cookie"/u);
  assert.doesNotMatch(source, /metadata:\s*session\.metadata|session_id:\s*session\.session_id/u);
  assert.doesNotMatch(source, /console\.(?:log|info|debug)/u);
});
