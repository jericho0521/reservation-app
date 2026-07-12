import assert from "node:assert/strict";
import test from "node:test";
import { assertSessionCredentialStorage } from "./supabase-store.js";

test("Supabase session persistence rejects plaintext credentials only when encryption is required", () => {
  const plaintext = JSON.stringify({ auth_directory: "/tmp/session" });
  assert.doesNotThrow(() => assertSessionCredentialStorage(plaintext, false));
  assert.throws(() => assertSessionCredentialStorage(plaintext, true), /must be encrypted/u);
  assert.doesNotThrow(() => assertSessionCredentialStorage("encrypted-envelope", true));
});
