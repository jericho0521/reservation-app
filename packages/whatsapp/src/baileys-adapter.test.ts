import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createEncryptedBaileysAuthState,
  deserializeBaileysSessionCredentials,
  BaileysWhatsAppSessionAdapter,
  baileysProviderMessageId,
  normalizeBaileysMessage,
  nextBaileysReconnectAttempt,
  serializeBaileysSessionCredentials,
} from "./baileys-adapter.js";

test("Baileys credential and key material is encrypted on disk and survives restart", async () => {
  const authDirectory = await mkdtemp(path.join(tmpdir(), "reservation-baileys-auth-"));
  const encryptionKey = "test-session-encryption-key";
  const privateCredential = "private-credential-material";
  const signalKey = "signal-key-material";
  const serialization = {
    replacer: (_key: string, value: unknown) => value,
    reviver: (_key: string, value: unknown) => value,
  };

  try {
    const first = await createEncryptedBaileysAuthState(authDirectory, encryptionKey, {
      initAuthCreds: () => ({ privateCredential, registered: false }),
      bufferJson: serialization,
      appStateSyncKeyFromObject: (value) => value,
    });
    (first.state.creds as { registered: boolean }).registered = true;
    await first.saveCreds();
    await first.state.keys.set({ session: { device_1: { signalKey } } });

    const files = await readdir(authDirectory);
    assert.ok(files.length >= 2);
    for (const file of files) {
      const content = await readFile(path.join(authDirectory, file), "utf8");
      assert.doesNotMatch(content, new RegExp(`${privateCredential}|${signalKey}`, "u"));
    }

    const restored = await createEncryptedBaileysAuthState(authDirectory, encryptionKey, {
      initAuthCreds: () => { throw new Error("restart must restore credentials"); },
      bufferJson: serialization,
      appStateSyncKeyFromObject: (value) => value,
    });
    assert.deepEqual(restored.state.creds, { privateCredential, registered: true });
    assert.deepEqual(await restored.state.keys.get("session", ["device_1"]), {
      device_1: { signalKey },
    });
  } finally {
    await rm(authDirectory, { recursive: true, force: true });
  }
});

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
