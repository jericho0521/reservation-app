import assert from "node:assert/strict";
import test from "node:test";

import {
  deserializeBaileysSessionCredentials,
  serializeBaileysSessionCredentials,
} from "./baileys-adapter.js";

test("Baileys session credentials stay plaintext when encryption is unset", () => {
  const payload = serializeBaileysSessionCredentials("/tmp/whatsapp/session-1");

  assert.equal(payload, JSON.stringify({ auth_directory: "/tmp/whatsapp/session-1" }));
  assert.deepEqual(deserializeBaileysSessionCredentials(payload), {
    auth_directory: "/tmp/whatsapp/session-1",
  });
});

test("Baileys session credentials encrypt and decrypt when a key is set", () => {
  const key = "test-session-encryption-key";
  const payload = serializeBaileysSessionCredentials("/tmp/whatsapp/session-1", key);

  assert.equal(payload.includes("/tmp/whatsapp/session-1"), false);
  assert.deepEqual(deserializeBaileysSessionCredentials(payload, key), {
    auth_directory: "/tmp/whatsapp/session-1",
  });
});
