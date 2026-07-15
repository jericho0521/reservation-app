import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import type { WhatsAppInboundMessage, WhatsAppSessionSnapshot } from "@reservation-platform/whatsapp";

import {
  createWhatsAppJobHandlers,
  decryptWhatsAppPairingQr,
  type WhatsAppWorkerJobHandlerOptions,
} from "./whatsapp.js";

const encryptionKey = "test-whatsapp-session-encryption-key";

test("pair job stores only an encrypted expiring QR", async () => {
  const calls: unknown[] = [];
  const handlers = createWhatsAppJobHandlers(fixture(calls, {
    started: snapshot({ qr_code: "raw-private-qr" }),
  }));

  await handlers["whatsapp.start_session"]?.(job("whatsapp.start_session"));

  const savedSnapshot = calls.find((call) => Array.isArray(call) && call[0] === "snapshot") as unknown[];
  const pairing = calls.find((call) => Array.isArray(call) && call[0] === "pairing") as [string, {
    encryptedQr: string;
    expiresAt: string;
  }];
  assert.equal(JSON.stringify(savedSnapshot).includes("raw-private-qr"), false);
  assert.equal(JSON.stringify(pairing).includes("raw-private-qr"), false);
  assert.equal(decryptWhatsAppPairingQr(pairing[1].encryptedQr, encryptionKey), "raw-private-qr");
  assert.equal(pairing[1].expiresAt, "2026-07-15T00:01:00.000Z");
});

test("WhatsApp worker refuses to start without its production encryption key", () => {
  assert.throws(
    () => createWhatsAppJobHandlers(fixture([], { sessionEncryptionKey: "" })),
    /SESSION_ENCRYPTION_KEY is required/u,
  );
});

test("restore persists status while keeping a returned QR encrypted", async () => {
  const calls: unknown[] = [];
  const handlers = createWhatsAppJobHandlers(fixture(calls, {
    restored: snapshot({ status: "pending_qr", qr_code: "restore-private-qr" }),
  }));

  await handlers["whatsapp.restore_session"]?.(job("whatsapp.restore_session"));

  assert.equal(JSON.stringify(calls).includes("restore-private-qr"), false);
  const pairing = calls.find((call) => Array.isArray(call) && call[0] === "pairing") as [string, { encryptedQr: string }];
  assert.equal(decryptWhatsAppPairingQr(pairing[1].encryptedQr, encryptionKey), "restore-private-qr");
});

test("logout clears the provider session and encrypted pairing state", async () => {
  const calls: unknown[] = [];
  const handlers = createWhatsAppJobHandlers(fixture(calls));

  await handlers["whatsapp.logout_session"]?.(job("whatsapp.logout_session"));

  assert.deepEqual(calls, [["logout"], ["clear-pairing", "tenant-1"]]);
});

test("inbound jobs deduplicate before enqueue and suppress automation during staff takeover", async () => {
  for (const result of [
    { inserted: false, conversationId: "conversation-1", messageId: "message-1", automationStatus: "automated" as const },
    { inserted: true, conversationId: "conversation-1", messageId: "message-1", automationStatus: "manual" as const },
    { inserted: true, conversationId: "conversation-1", messageId: "message-1", automationStatus: "automated" as const },
  ]) {
    const calls: unknown[] = [];
    const handlers = createWhatsAppJobHandlers(fixture(calls, { inboundResult: result }));
    await handlers["whatsapp.process_inbound"]?.(job("whatsapp.process_inbound", { message: inbound() }));
    assert.equal(calls.filter((call) => Array.isArray(call) && call[0] === "enqueue").length, result.inserted && result.automationStatus === "automated" ? 1 : 0);
  }
});

test("outbound delivery claims once and stores only the provider message id", async () => {
  const calls: unknown[] = [];
  const options = fixture(calls);
  let claimCount = 0;
  options.state.claimOutbound = async (outboxId) => {
    calls.push(["claim", outboxId]);
    return claimCount++ === 0 ? { message: { provider: "session_qr", to: "60123@s.whatsapp.net", text: "Hello" } } : undefined;
  };
  const handlers = createWhatsAppJobHandlers(options);
  const outbound = job("whatsapp.deliver_outbound", { outboxId: "outbox-1" });

  await handlers["whatsapp.deliver_outbound"]?.(outbound);
  await handlers["whatsapp.deliver_outbound"]?.(outbound);

  assert.equal(calls.filter((call) => Array.isArray(call) && call[0] === "send").length, 1);
  assert.deepEqual(calls.find((call) => Array.isArray(call) && call[0] === "delivered"), ["delivered", "outbox-1", "provider-safe-id"]);
  assert.doesNotMatch(JSON.stringify(calls.find((call) => Array.isArray(call) && call[0] === "delivered")), /Hello/u);
});

test("production WhatsApp composition owns Baileys and compose keeps it out of the API", async () => {
  const [workerSource, compose] = await Promise.all([
    readFile(new URL("./whatsapp.ts", import.meta.url), "utf8"),
    readFile(new URL("../../../compose.production.yml", import.meta.url), "utf8"),
  ]);
  assert.match(workerSource, /createProductionWhatsAppRuntime/u);
  assert.match(workerSource, /new BaileysWhatsAppSessionAdapter/u);
  assert.match(workerSource, /requireEncryptedCredentials: true/u);
  assert.match(workerSource, /enqueueRestore/u);
  const api = compose.match(/  reservation-api:[\s\S]*?\n  reservation-worker:/u)?.[0] ?? "";
  const workerCompose = compose.match(/  reservation-worker:[\s\S]*?\n  reservation-console:/u)?.[0] ?? "";
  assert.match(api, /RESERVATION_WHATSAPP_ENABLED: "false"/u);
  assert.doesNotMatch(api, /reservation-whatsapp-sessions:\/app/u);
  assert.match(workerCompose, /RESERVATION_WHATSAPP_ENABLED: "true"/u);
  assert.match(workerCompose, /RESERVATION_WHATSAPP_PROVIDER: session_qr/u);
  assert.match(workerCompose, /reservation-whatsapp-sessions:\/app\/\.reservation-whatsapp-sessions/u);
});

function fixture(calls: unknown[], overrides: {
  started?: WhatsAppSessionSnapshot;
  restored?: WhatsAppSessionSnapshot;
  sessionEncryptionKey?: string;
  inboundResult?: { inserted: boolean; conversationId?: string; messageId?: string; automationStatus?: "automated" | "manual" };
} = {}): WhatsAppWorkerJobHandlerOptions {
  return {
    sessionEncryptionKey: overrides.sessionEncryptionKey ?? encryptionKey,
    now: () => new Date("2026-07-15T00:00:00.000Z"),
    session: {
      async startSession() {
        return overrides.started ?? snapshot();
      },
      async restoreSessionConnection() {
        return overrides.restored ?? snapshot({ status: "connected", qr_code: undefined });
      },
      async logoutSession() {
        calls.push(["logout"]);
        return snapshot({ status: "disconnected", qr_code: undefined });
      },
    },
    state: {
      async saveSessionSnapshot(value) { calls.push(["snapshot", value]); },
      async savePairing(value) { calls.push(["pairing", value]); },
      async clearPairing(tenantId) { calls.push(["clear-pairing", tenantId]); },
      async markCommand(commandId, status, code) { calls.push(["command", commandId, status, code]); },
      async persistInbound(message) {
        calls.push(["inbound", message.messageId]);
        return overrides.inboundResult ?? { inserted: true, conversationId: "conversation-1", messageId: "message-1", automationStatus: "automated" };
      },
      async enqueueConversation(value) { calls.push(["enqueue", value]); },
      async claimOutbound(outboxId) {
        calls.push(["claim", outboxId]);
        return { message: { provider: "session_qr", to: "60123@s.whatsapp.net", text: "Hello" } };
      },
      async markOutboundDelivered(outboxId, providerMessageId) { calls.push(["delivered", outboxId, providerMessageId]); },
      async releaseOutbound(outboxId, code) { calls.push(["release", outboxId, code]); },
    },
    sender: {
      async send(message) {
        calls.push(["send", message]);
        return { providerMessageId: "provider-safe-id" };
      },
    },
  };
}

function snapshot(overrides: Partial<WhatsAppSessionSnapshot> = {}): WhatsAppSessionSnapshot {
  return {
    provider: "session_qr",
    status: "pending_qr",
    session_id: "session-1",
    qr_code: "raw-private-qr",
    updated_at: "2026-07-15T00:00:00.000Z",
    ...overrides,
  };
}

function inbound(): WhatsAppInboundMessage {
  return {
    provider: "session_qr",
    messageId: "provider-message-1",
    from: { id: "60123@s.whatsapp.net" },
    text: "Book an appointment",
  };
}

function job(kind: string, payload: Record<string, unknown> = {}) {
  return {
    jobId: "job-1",
    tenantId: "tenant-1",
    venueId: "venue-1",
    kind,
    payload,
    attempts: 1,
    maxAttempts: 5,
    availableAt: "2026-07-15T00:00:00.000Z",
  };
}
