import assert from "node:assert/strict";
import test from "node:test";
import {
  SecretDecryptionError,
  decryptSecretEnvelope,
  encryptSecretEnvelope,
  parseSecretEnvelope,
} from "./secret-envelope.js";

const installationKey = "one high entropy installation key kept outside the database";

test("secret envelope round-trips and uses a fresh IV", () => {
  const first = encryptSecretEnvelope({ apiKey: "secret" }, installationKey);
  const second = encryptSecretEnvelope({ apiKey: "secret" }, installationKey);

  assert.notEqual(first.iv, second.iv);
  assert.notEqual(first.ciphertext, second.ciphertext);
  assert.deepEqual(decryptSecretEnvelope(first, installationKey), { apiKey: "secret" });
});

test("secret envelope uses the locked version, algorithm, and field sizes", () => {
  const envelope = encryptSecretEnvelope({ password: "secret" }, installationKey);

  assert.equal(envelope.v, 1);
  assert.equal(envelope.alg, "aes-256-gcm");
  assert.equal(Buffer.from(envelope.iv, "base64url").length, 12);
  assert.equal(Buffer.from(envelope.tag, "base64url").length, 16);
  assert.deepEqual(parseSecretEnvelope(envelope), envelope);
});

test("malformed and unauthenticated envelopes fail with one sanitized typed error", () => {
  const valid = encryptSecretEnvelope({ apiKey: "must-not-leak" }, installationKey);
  const cases: unknown[] = [
    { ...valid, v: 2 },
    { ...valid, alg: "aes-128-gcm" },
    { ...valid, iv: "short" },
    { ...valid, tag: "not+base64url" },
    { ...valid, ciphertext: "" },
    { ...valid, unexpected: true },
    {
      ...valid,
      ciphertext: `${valid.ciphertext.slice(0, -1)}${valid.ciphertext.endsWith("A") ? "B" : "A"}`,
    },
  ];

  for (const envelope of cases) {
    assert.throws(
      () => decryptSecretEnvelope(envelope, installationKey),
      (error: unknown) => error instanceof SecretDecryptionError
        && error.code === "secret_decryption_failed"
        && !error.message.includes("must-not-leak"),
    );
  }
});

test("the wrong installation key does not expose authentication detail", () => {
  const envelope = encryptSecretEnvelope({ apiKey: "secret" }, installationKey);
  assert.throws(
    () => decryptSecretEnvelope(envelope, "a different installation key"),
    (error: unknown) => error instanceof SecretDecryptionError
      && error.message === "Integration credential could not be decrypted.",
  );
});
