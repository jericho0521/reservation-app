import assert from "node:assert/strict";
import test from "node:test";
import { encryptJson } from "./crypto.js";
import {
  assertSessionCredentialStorage,
  SupabaseWhatsAppModuleStore,
  type SupabaseWhatsAppClient,
} from "./supabase-store.js";

test("Supabase session persistence rejects plaintext credentials only when encryption is required", () => {
  const plaintext = JSON.stringify({ auth_directory: "/tmp/session" });
  assert.doesNotThrow(() => assertSessionCredentialStorage(plaintext, false));
  assert.throws(() => assertSessionCredentialStorage(plaintext, true), /must be encrypted/u);
  assert.throws(() => assertSessionCredentialStorage("encrypted-envelope", true), /must be encrypted/u);
  assert.doesNotThrow(() => assertSessionCredentialStorage(
    encryptJson({ auth_directory: "/tmp/session" }, "test-session-encryption-key"),
    true,
  ));
});

test("Supabase production store rejects legacy plaintext credentials on load", async () => {
  const query = {
    select() { return this; },
    limit() { return this; },
    async maybeSingle() {
      return {
        data: {
          id: "session-1",
          provider: "session_qr",
          status: "connected",
          encrypted_credentials: JSON.stringify({ auth_directory: "/tmp/session" }),
          updated_at: "2026-07-15T00:00:00.000Z",
        },
        error: null,
      };
    },
  };
  const client = { from: () => query } as unknown as SupabaseWhatsAppClient;
  const store = new SupabaseWhatsAppModuleStore(client, { requireEncryptedCredentials: true });

  await assert.rejects(() => store.load(), /must be encrypted/u);
});
