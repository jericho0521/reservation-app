import assert from "node:assert/strict";
import test from "node:test";
import {
  deleteIntegrationCredential,
  readEmailIntegrationSettings,
  readIntegrationSettings,
  rotateIntegrationCredential,
  saveIntegrationSettings,
  saveEmailIntegrationSettings,
  testEmailIntegration,
  type IntegrationSettingsRepository,
  type SecretEnvelopeV1,
} from "./integrations.js";
import { PlatformAuthError, type AuthenticatedPrincipal } from "./sessions.js";

const owner: AuthenticatedPrincipal = {
  userId: "owner-1",
  tenantId: "tenant-1",
  role: "owner",
  venueIds: [],
};
const envelope: SecretEnvelopeV1 = {
  v: 1,
  alg: "aes-256-gcm",
  iv: "a-secure-iv",
  tag: "an-authentication-tag",
  ciphertext: "encrypted-secret",
};

function fixture() {
  const calls: unknown[] = [];
  const repository: IntegrationSettingsRepository = {
    async read(tenantId, kind) {
      calls.push(["read", tenantId, kind]);
      return {
        tenantId,
        kind,
        enabled: true,
        provider: "smtp",
        publicConfig: { host: "smtp.example.com", port: 587 },
        credentialPresent: true,
        updatedAt: "2026-07-15T00:00:00.000Z",
      };
    },
    async saveSettings(input) {
      calls.push(["saveSettings", input]);
      return {
        tenantId: input.tenantId,
        kind: input.kind,
        enabled: input.enabled,
        provider: input.provider,
        publicConfig: input.publicConfig,
        credentialPresent: input.envelope !== undefined,
        updatedAt: "2026-07-15T00:00:00.000Z",
      };
    },
    async rotateCredential(input) { calls.push(["rotateCredential", input]); },
    async readCredential(tenantId, kind) { calls.push(["readCredential", tenantId, kind]); return envelope; },
    async deleteCredential(input) { calls.push(["deleteCredential", input]); },
  };
  return { repository, calls };
}

test("settings response never exposes the envelope", async () => {
  const { repository } = fixture();
  const result = await readIntegrationSettings({ principal: owner, kind: "email", repository });

  assert.equal(result?.credentialPresent, true);
  assert.equal("ciphertext" in result!, false);
  assert.equal(JSON.stringify(result).includes(envelope.ciphertext), false);
});

test("saving settings encrypts credentials and returns only sanitized metadata", async () => {
  const { repository, calls } = fixture();
  const result = await saveIntegrationSettings({
    principal: owner,
    kind: "email",
    settings: {
      enabled: true,
      provider: " smtp ",
      publicConfig: { host: "smtp.example.com", port: 587 },
      credential: { username: "mailer", password: "must-not-leak" },
    },
    repository,
    encryptCredential(credential) {
      assert.equal((credential as { password: string }).password, "must-not-leak");
      return envelope;
    },
  });

  assert.equal(result.credentialPresent, true);
  assert.equal(JSON.stringify(result).includes("must-not-leak"), false);
  assert.deepEqual(calls[0], ["saveSettings", {
    tenantId: "tenant-1",
    actorUserId: "owner-1",
    kind: "email",
    enabled: true,
    provider: "smtp",
    publicConfig: { host: "smtp.example.com", port: 587 },
    envelope,
  }]);
  assert.equal(JSON.stringify(calls).includes("must-not-leak"), false);
});

test("public configuration rejects secret fields before repository writes", async () => {
  const { repository, calls } = fixture();
  await assert.rejects(() => saveIntegrationSettings({
    principal: owner,
    kind: "ai",
    settings: {
      enabled: true,
      provider: "openai",
      publicConfig: { model: "gpt", nested: { apiKey: "must-not-be-public" } },
    },
    repository,
    encryptCredential: () => envelope,
  }), (error: unknown) => error instanceof PlatformAuthError && error.code === "validation_failed");
  assert.deepEqual(calls, []);
});

test("public configuration uses provider-specific allowlists and rejects credential-bearing values", async () => {
  for (const settings of [
    { enabled: true, provider: "smtp", publicConfig: { authorization: "Bearer top-secret" } },
    { enabled: true, provider: "openai", publicConfig: { base_url: "https://user:secret@example.com/v1" } },
    { enabled: true, provider: "openai", publicConfig: { model: "sk-secret-value" } },
    { enabled: true, provider: "baileys", publicConfig: { connectionString: "postgres://secret" } },
  ]) {
    const { repository, calls } = fixture();
    const kind = settings.provider === "smtp" ? "email" : settings.provider === "baileys" ? "whatsapp" : "ai";
    await assert.rejects(() => saveIntegrationSettings({
      principal: owner,
      kind,
      settings,
      repository,
      encryptCredential: () => envelope,
    }), (error: unknown) => error instanceof PlatformAuthError && error.code === "validation_failed");
    assert.deepEqual(calls, []);
  }
});

test("all integration operations are owner-only", async () => {
  const { repository, calls } = fixture();
  const staff = { ...owner, role: "staff" as const };

  await assert.rejects(() => readIntegrationSettings({ principal: staff, kind: "email", repository }), PlatformAuthError);
  await assert.rejects(() => rotateIntegrationCredential({
    principal: staff,
    kind: "email",
    credential: { password: "secret" },
    repository,
    encryptCredential: () => envelope,
  }), PlatformAuthError);
  await assert.rejects(() => deleteIntegrationCredential({ principal: staff, kind: "email", repository }), PlatformAuthError);
  assert.deepEqual(calls, []);
});

test("rotate and delete delegate atomic audited mutations without credential material", async () => {
  const { repository, calls } = fixture();
  await rotateIntegrationCredential({
    principal: owner,
    kind: "whatsapp",
    credential: { sessionKey: "must-not-leak" },
    repository,
    encryptCredential: () => envelope,
  });
  await deleteIntegrationCredential({ principal: owner, kind: "whatsapp", repository });

  assert.deepEqual(calls, [
    ["rotateCredential", { tenantId: "tenant-1", actorUserId: "owner-1", kind: "whatsapp", envelope }],
    ["deleteCredential", { tenantId: "tenant-1", actorUserId: "owner-1", kind: "whatsapp" }],
  ]);
  assert.equal(JSON.stringify(calls).includes("must-not-leak"), false);
});

test("repository responses cannot cross tenant or integration scope", async () => {
  const { repository } = fixture();
  repository.read = async () => ({
    tenantId: "another-tenant",
    kind: "ai",
    enabled: true,
    provider: "openai",
    publicConfig: {},
    credentialPresent: false,
    updatedAt: "2026-07-15T00:00:00.000Z",
  });
  await assert.rejects(
    () => readIntegrationSettings({ principal: owner, kind: "email", repository }),
    /outside the requested scope/u,
  );
});

test("email settings map SMTP fields without returning username, password, or envelope", async () => {
  const { repository, calls } = fixture();
  const saved = await saveEmailIntegrationSettings({
    principal: owner,
    settings: {
      enabled: true,
      host: "smtp.example.com",
      port: 587,
      tls_mode: "starttls",
      from_address: "bookings@example.com",
      username: "mailer",
      password: "must-not-leak",
    },
    repository,
    encryptCredential(credential) {
      assert.deepEqual(credential, { username: "mailer", password: "must-not-leak" });
      return envelope;
    },
  });
  assert.deepEqual(saved, {
    enabled: true,
    provider: "smtp",
    configured: true,
    host: "smtp.example.com",
    port: 587,
    tls_mode: "starttls",
    from_address: "bookings@example.com",
    credential_present: true,
    updated_at: "2026-07-15T00:00:00.000Z",
  });
  assert.equal(JSON.stringify(saved).includes("mailer"), false);
  assert.equal(JSON.stringify(saved).includes("must-not-leak"), false);
  assert.equal(JSON.stringify(calls).includes("must-not-leak"), false);
});

test("email settings preserve the stored credential when password fields are omitted", async () => {
  const { repository, calls } = fixture();
  await saveEmailIntegrationSettings({
    principal: owner,
    settings: { enabled: true, host: "smtp.example.com", port: 465, tls_mode: "required", from_address: "bookings@example.com" },
    repository,
    encryptCredential() { throw new Error("credential should not be rotated"); },
  });
  assert.deepEqual(calls.map((call) => (call as unknown[])[0]), ["saveSettings"]);
});

test("unconfigured email settings return a safe disabled response", async () => {
  const { repository } = fixture();
  repository.read = async () => undefined;
  assert.deepEqual(await readEmailIntegrationSettings({ principal: owner, repository }), {
    enabled: false,
    provider: "smtp",
    configured: false,
    credential_present: false,
  });
});

test("SMTP connection tests are bounded and sanitize provider failures", async () => {
  const { repository } = fixture();
  repository.read = async (tenantId, kind) => ({
    tenantId,
    kind,
    enabled: true,
    provider: "smtp",
    publicConfig: { host: "smtp.example.com", port: 587, tls_mode: "starttls", from_address: "bookings@example.com" },
    credentialPresent: true,
    updatedAt: "2026-07-15T00:00:00.000Z",
  });
  let decrypted = false;
  const failed = await testEmailIntegration({
    principal: owner,
    repository,
    decryptCredential(value) {
      assert.equal(value, envelope);
      decrypted = true;
      return { username: "mailer", password: "must-not-leak" };
    },
    tester: { async test(input) {
      assert.deepEqual(input.settings, { host: "smtp.example.com", port: 587, tlsMode: "starttls", from: "bookings@example.com" });
      assert.equal(input.credential.password, "must-not-leak");
      throw new Error("provider leaked must-not-leak at internal host 10.0.0.1");
    } },
    timeoutMs: 10,
  });
  assert.equal(decrypted, true);
  assert.deepEqual(failed, { ok: false, message: "SMTP connection could not be established.", error_code: "connection_failed" });
  assert.equal(JSON.stringify(failed).includes("must-not-leak"), false);

  const timedOut = await testEmailIntegration({
    principal: owner,
    repository,
    decryptCredential: () => ({ username: "mailer", password: "secret" }),
    tester: { test: () => new Promise<void>(() => {}) },
    timeoutMs: 1,
  });
  assert.equal(timedOut.error_code, "connection_failed");
});

test("staff cannot read, save, or test email settings", async () => {
  const { repository } = fixture();
  const staff = { ...owner, role: "staff" as const };
  await assert.rejects(() => readEmailIntegrationSettings({ principal: staff, repository }), PlatformAuthError);
  await assert.rejects(() => saveEmailIntegrationSettings({
    principal: staff,
    settings: { enabled: true, host: "smtp.example.com", port: 587, tls_mode: "starttls", from_address: "bookings@example.com" },
    repository,
    encryptCredential: () => envelope,
  }), PlatformAuthError);
  await assert.rejects(() => testEmailIntegration({
    principal: staff,
    repository,
    decryptCredential: () => ({}),
    tester: { async test() {} },
  }), PlatformAuthError);
});
