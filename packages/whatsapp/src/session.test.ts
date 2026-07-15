import assert from "node:assert/strict";
import test from "node:test";

import {
  InMemoryWhatsAppSessionStore,
  WhatsAppModuleDisabledError,
  WhatsAppSessionNotReadyError,
  WhatsAppSessionService,
  normalizeWhatsAppInboundTextMessage,
} from "./index.js";

test("disabled session service reports disabled and rejects lifecycle mutations", async () => {
  const service = new WhatsAppSessionService({ enabled: false });

  assert.equal((await service.status()).status, "disabled");
  await assert.rejects(() => service.start(), WhatsAppModuleDisabledError);
  await assert.rejects(() => service.qr(), WhatsAppModuleDisabledError);
  await assert.rejects(() => service.logout(), WhatsAppModuleDisabledError);
});

test("start returns pending QR and status reuses stored session", async () => {
  const service = new WhatsAppSessionService({
    enabled: true,
    store: new InMemoryWhatsAppSessionStore(),
    now: () => new Date("2026-06-30T00:00:00.000Z"),
  });

  const started = await service.start({
    tenant_id: "tenant_1",
    venue_id: "venue_1",
    metadata: { source: "test" },
  });

  assert.equal(started.status, "pending_qr");
  assert.equal(started.provider, "session_qr");
  assert.match(started.qr_code ?? "", /^reservation-platform:whatsapp-session:/);
  assert.equal(started.metadata?.tenant_id, "tenant_1");

  const qr = await service.qr();
  assert.equal(qr.session_id, started.session_id);
  assert.equal(qr.qr_code, started.qr_code);

  const status = await service.status();
  assert.equal(status.session_id, started.session_id);
  assert.equal(status.status, "pending_qr");
});

test("markConnected removes QR and logout clears session", async () => {
  const service = new WhatsAppSessionService({ enabled: true });
  await service.start();

  const connected = await service.markConnected({ encrypted_credentials: "encrypted" });
  assert.equal(connected.status, "connected");
  assert.equal(connected.qr_code, undefined);
  assert.ok(connected.connected_at);

  await assert.rejects(() => service.qr(), WhatsAppSessionNotReadyError);

  const loggedOut = await service.logout();
  assert.equal(loggedOut.status, "disconnected");
  assert.equal((await service.status()).status, "disconnected");
});

test("restore passes persisted credentials to the session adapter", async () => {
  let restoredCredentials: string | undefined;
  const service = new WhatsAppSessionService({
    enabled: true,
    adapter: {
      async start() {
        return { qr_code: "qr", encrypted_credentials: "persisted-credentials" };
      },
      async restore(input) {
        restoredCredentials = input.encrypted_credentials;
        return { status: "connected" as const };
      },
      async logout() {
        return undefined;
      },
    },
  });

  await service.start();
  await service.restoreConnection();

  assert.equal(restoredCredentials, "persisted-credentials");
});

test("worker ownership can return a pairing QR without persisting its raw payload", async () => {
  const store = new InMemoryWhatsAppSessionStore();
  const service = new WhatsAppSessionService({
    enabled: true,
    store,
    persistQrCode: false,
    adapter: {
      async start() {
        return { qr_code: "raw-private-qr", encrypted_credentials: "encrypted" };
      },
      async logout() {
        return undefined;
      },
    },
  });

  const started = await service.start();

  assert.equal(started.qr_code, "raw-private-qr");
  assert.equal((await store.load())?.qr_code, undefined);
  await assert.rejects(() => service.qr(), WhatsAppSessionNotReadyError);
});

test("normalizes inbound WhatsApp text and ignores unsupported messages", () => {
  assert.deepEqual(
    normalizeWhatsAppInboundTextMessage({
      provider: "session_qr",
      messageId: "wamid_1",
      from: { id: "60123456789", phoneNumber: "+60123456789" },
      text: "  book a room  ",
      raw: { event: "message" },
    }),
    {
      customer: { id: "60123456789", phoneNumber: "+60123456789" },
      message: "book a room",
      source: "whatsapp",
      provider: "session_qr",
      providerMessageId: "wamid_1",
      metadata: { event: "message" },
    },
  );

  assert.equal(
    normalizeWhatsAppInboundTextMessage({
      provider: "session_qr",
      messageId: "wamid_2",
      from: { id: "60123456789" },
    }),
    null,
  );
});
