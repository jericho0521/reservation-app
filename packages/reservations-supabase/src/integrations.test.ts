import assert from "node:assert/strict";
import test from "node:test";
import {
  createSupabaseIntegrationSettingsRepository,
  type IntegrationSupabaseClient,
} from "./integrations.js";

type Result = { data: unknown; error: unknown | null };

function fakeClient(calls: unknown[], results: Result[]): IntegrationSupabaseClient {
  return {
    async rpc(name: string, params?: Record<string, unknown>) {
      calls.push(["rpc", name, params]);
      return results.shift() ?? { data: null, error: null };
    },
    from(table: string) {
      calls.push(["from", table]);
      const result = Promise.resolve(results.shift() ?? { data: null, error: null });
      const builder = {
        select(columns?: string) { calls.push(["select", columns]); return builder; },
        eq(column: string, value: unknown) { calls.push(["eq", column, value]); return builder; },
        upsert(value: unknown, options?: unknown) { calls.push(["upsert", value, options]); return builder; },
        delete() { calls.push(["delete"]); return builder; },
        maybeSingle() { calls.push(["maybeSingle"]); return result; },
        then(resolve: (value: Result) => unknown, reject?: (reason: unknown) => unknown) {
          return result.then(resolve, reject);
        },
      };
      return builder;
    },
  };
}

const settingsRow = {
  tenant_id: "tenant-1",
  kind: "email",
  enabled: true,
  provider: "smtp",
  public_config: { host: "smtp.example.com", port: 587 },
  updated_at: "2026-07-15T00:00:00.000Z",
};
const envelope = {
  v: 1,
  alg: "aes-256-gcm",
  iv: "YWFhYWFhYWFhYWFh",
  tag: "YmJiYmJiYmJiYmJiYmJiYg",
  ciphertext: "Y2lwaGVydGV4dA",
};

test("integration reads are tenant and kind scoped without selecting credential contents", async () => {
  const calls: unknown[] = [];
  const repository = createSupabaseIntegrationSettingsRepository(fakeClient(calls, [
    { data: settingsRow, error: null },
    { data: { tenant_id: "tenant-1" }, error: null },
  ]));

  assert.deepEqual(await repository.read("tenant-1", "email"), {
    tenantId: "tenant-1",
    kind: "email",
    enabled: true,
    provider: "smtp",
    publicConfig: { host: "smtp.example.com", port: 587 },
    credentialPresent: true,
    updatedAt: "2026-07-15T00:00:00.000Z",
  });
  assert.deepEqual(calls, [
    ["from", "platform_integration_settings"],
    ["select", "tenant_id, kind, enabled, provider, public_config, updated_at"],
    ["eq", "tenant_id", "tenant-1"],
    ["eq", "kind", "email"],
    ["maybeSingle"],
    ["from", "platform_integration_credentials"],
    ["select", "tenant_id"],
    ["eq", "tenant_id", "tenant-1"],
    ["eq", "kind", "email"],
    ["maybeSingle"],
  ]);
  assert.equal(JSON.stringify(calls).includes("envelope"), false);
});

test("settings upsert uses the tenant-kind key and returns credential presence", async () => {
  const calls: unknown[] = [];
  const repository = createSupabaseIntegrationSettingsRepository(fakeClient(calls, [
    { data: { ...settingsRow, credential_present: true }, error: null },
  ]));

  const saved = await repository.saveSettings({
    tenantId: "tenant-1",
    kind: "email",
    enabled: true,
    provider: "smtp",
    publicConfig: { host: "smtp.example.com", port: 587 },
    actorUserId: "owner-1",
    envelope,
  });

  assert.equal(saved.credentialPresent, true);
  assert.deepEqual(calls, [["rpc", "platform_save_integration_settings", {
    p_tenant_id: "tenant-1",
    p_actor_user_id: "owner-1",
    p_kind: "email",
    p_enabled: true,
    p_provider: "smtp",
    p_public_config: { host: "smtp.example.com", port: 587 },
    p_envelope: envelope,
  }]]);
});

test("credential rotation is atomic with its audit and reads only a versioned envelope", async () => {
  const calls: unknown[] = [];
  const repository = createSupabaseIntegrationSettingsRepository(fakeClient(calls, [
    { data: null, error: null },
    { data: { envelope }, error: null },
  ]));

  await repository.rotateCredential({ tenantId: "tenant-1", actorUserId: "owner-1", kind: "ai", envelope });
  assert.deepEqual(await repository.readCredential("tenant-1", "ai"), envelope);
  assert.deepEqual(calls, [
    ["rpc", "platform_rotate_integration_credential", {
      p_tenant_id: "tenant-1",
      p_actor_user_id: "owner-1",
      p_kind: "ai",
      p_envelope: envelope,
    }],
    ["from", "platform_integration_credentials"],
    ["select", "envelope"],
    ["eq", "tenant_id", "tenant-1"],
    ["eq", "kind", "ai"],
    ["maybeSingle"],
  ]);
});

test("credential deletion is tenant, kind, and actor scoped in one RPC", async () => {
  const calls: unknown[] = [];
  const repository = createSupabaseIntegrationSettingsRepository(fakeClient(calls, [
    { data: null, error: null },
  ]));

  await repository.deleteCredential({ tenantId: "tenant-1", actorUserId: "owner-1", kind: "whatsapp" });
  assert.deepEqual(calls, [["rpc", "platform_delete_integration_credential", {
    p_tenant_id: "tenant-1",
    p_actor_user_id: "owner-1",
    p_kind: "whatsapp",
  }]]);
});

test("malformed stored envelopes fail closed", async () => {
  const repository = createSupabaseIntegrationSettingsRepository(fakeClient([], [
    { data: { envelope: { ...envelope, alg: "plaintext" } }, error: null },
  ]));
  await assert.rejects(() => repository.readCredential("tenant-1", "email"), /invalid secret envelope/u);
});
