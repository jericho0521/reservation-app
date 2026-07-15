import assert from "node:assert/strict";
import test from "node:test";
import { createFirstOwner } from "./installation.js";
import { PlatformAuthError, type PlatformSessionRepository } from "./sessions.js";

function repository(): PlatformSessionRepository & { ownerCalls: unknown[]; sessionCalls: unknown[] } {
  const ownerCalls: unknown[] = [];
  const sessionCalls: unknown[] = [];
  let consumed = false;
  return {
    ownerCalls,
    sessionCalls,
    async readInstallation() { return undefined; },
    async consumeSetupToken() { return undefined; },
    async createFirstOwner(input) {
      ownerCalls.push(input);
      if (consumed) return undefined;
      consumed = true;
      return {
        installation: { installationId: "installation", tenantId: "tenant", domain: "example.com", setupCompleted: true },
        user: { userId: "owner", tenantId: "tenant", email: input.email, displayName: input.displayName, passwordHash: input.passwordHash, role: "owner", status: "active", venueIds: [] },
      };
    },
    async createUser() { throw new Error("unused"); },
    async findUserByEmail() { return undefined; },
    async createSession(input) { sessionCalls.push(input); return true; },
    async readSession() { return undefined; },
    async revokeSession() {},
    async createPasswordResetToken() {},
    async completePasswordReset() { return false; },
  };
}

test("first owner consumes setup token once and receives an owner session", async () => {
  const repositories = repository();
  const result = await createFirstOwner({
    setupToken: "a".repeat(43),
    input: { email: " OWNER@Example.com ", displayName: " Owner ", password: "correct horse battery staple" },
    repositories,
    passwordHasher: { hash: async () => "$argon2id$hash", verify: async () => false },
    tokenFactory: () => "s".repeat(43),
    now: new Date("2026-07-14T00:00:00Z"),
  });

  assert.equal(result.principal.role, "owner");
  assert.equal(result.expiresAt, "2026-07-14T12:00:00.000Z");
  assert.equal((repositories.ownerCalls[0] as { email: string }).email, "owner@example.com");
  assert.equal(JSON.stringify(repositories.ownerCalls).includes("a".repeat(43)), false);
  assert.equal(JSON.stringify(repositories.sessionCalls).includes("s".repeat(43)), false);

  await assert.rejects(() => createFirstOwner({
    setupToken: "a".repeat(43),
    input: { email: "owner@example.com", displayName: "Owner", password: "correct horse battery staple" },
    repositories,
    passwordHasher: { hash: async () => "$argon2id$hash", verify: async () => false },
    tokenFactory: () => "s".repeat(43),
    now: new Date("2026-07-14T00:00:01Z"),
  }), (error: unknown) => error instanceof PlatformAuthError && error.code === "setup_unavailable");
});

test("first owner validates email, display name, password, and setup token before hashing", async () => {
  let hashes = 0;
  await assert.rejects(() => createFirstOwner({
    setupToken: "short",
    input: { email: "bad", displayName: " ", password: "short" },
    repositories: repository(),
    passwordHasher: { hash: async () => { hashes += 1; return "hash"; }, verify: async () => false },
    now: new Date(),
  }), (error: unknown) => error instanceof PlatformAuthError && error.code === "validation_failed");
  assert.equal(hashes, 0);
});
