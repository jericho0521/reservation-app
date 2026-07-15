import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  deserializeBaileysSessionCredentials,
  BaileysWhatsAppSessionAdapter,
  baileysProviderMessageId,
  normalizeBaileysMessage,
  nextBaileysReconnectAttempt,
  serializeBaileysSessionCredentials,
} from "./baileys-adapter.js";

test("Baileys session credentials stay plaintext when encryption is unset", () => {
  const payload = serializeBaileysSessionCredentials("/tmp/whatsapp/session-1");

  assert.equal(payload, JSON.stringify({ auth_directory: "/tmp/whatsapp/session-1" }));
  assert.deepEqual(deserializeBaileysSessionCredentials(payload), {
    auth_directory: "/tmp/whatsapp/session-1",
  });
});

test("Baileys normalization produces stable dedup ids without logging QR payloads", () => {
  const input = { key: { remoteJid: "60123@s.whatsapp.net", fromMe: false }, message: { conversation: "hello" }, messageTimestamp: 123 };
  const first = normalizeBaileysMessage(input);
  const second = normalizeBaileysMessage(input);
  assert.equal(first?.messageId, second?.messageId);
  assert.match(first?.messageId ?? "", /^baileys:[0-9a-f]{64}$/u);
});

test("Baileys adapter never renders or logs QR pairing payloads", async () => {
  const source = await readFile(new URL("./baileys-adapter.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /qrcode-terminal|printTerminalQr/u);
  assert.doesNotMatch(source, /console\.(?:log|info|warn)\([^\n]*\bqr\b/iu);
});

test("Baileys reconnect policy retries bounded transient closes and stops after logout", () => {
  assert.equal(nextBaileysReconnectAttempt(0, 3, 500), 1);
  assert.equal(nextBaileysReconnectAttempt(3, 3, 500), undefined);
  assert.equal(nextBaileysReconnectAttempt(0, 3, 401), undefined);
});

test("Baileys normalization forwards unsupported inbound content to the unified handler", () => {
  const message = normalizeBaileysMessage({ key: { id: "media_1", remoteJid: "60123@s.whatsapp.net", fromMe: false }, message: {} });
  assert.equal(message?.messageId, "media_1");
  assert.equal(message?.text, undefined);
});

test("Baileys session credentials encrypt and decrypt when a key is set", () => {
  const key = "test-session-encryption-key";
  const payload = serializeBaileysSessionCredentials("/tmp/whatsapp/session-1", key);

  assert.equal(payload.includes("/tmp/whatsapp/session-1"), false);
  assert.deepEqual(deserializeBaileysSessionCredentials(payload, key), {
    auth_directory: "/tmp/whatsapp/session-1",
  });
});

test("Baileys production mode requires a credential encryption key", () => {
  assert.throws(
    () => new BaileysWhatsAppSessionAdapter({
      authDirectory: "/tmp/whatsapp",
      requireEncryptedCredentials: true,
    }),
    /encryption key is required/u,
  );
  assert.doesNotThrow(() => new BaileysWhatsAppSessionAdapter({
    authDirectory: "/tmp/whatsapp",
    sessionEncryptionKey: "test-session-encryption-key",
    requireEncryptedCredentials: true,
  }));
});

test("Baileys delivery exposes only the provider message id for outbox persistence", () => {
  assert.equal(baileysProviderMessageId({ key: { id: "provider-message-1" }, message: { conversation: "private" } }), "provider-message-1");
  assert.equal(baileysProviderMessageId({ message: { conversation: "private" } }), undefined);
});
