import assert from "node:assert/strict";
import test from "node:test";
import {
  PlatformAuthError,
  authenticateSession,
  authorizeVenue,
  loginWithPassword,
  logoutSession,
  completePasswordReset,
  requestPasswordReset,
  requireOwner,
  type PlatformSessionRepository,
} from "./sessions.js";

const activeUser = { userId: "user", tenantId: "tenant", email: "owner@example.com", displayName: "Owner", passwordHash: "stored-hash", role: "owner" as const, status: "active" as const, venueIds: ["venue-a"] };

function repository(user = activeUser as typeof activeUser | undefined): PlatformSessionRepository & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    async readInstallation() { return { installationId: "installation", tenantId: "tenant", domain: "example.com", setupCompleted: true }; },
    async consumeSetupToken() { return undefined; },
    async createFirstOwner() { return undefined; },
    async createUser() { throw new Error("unused"); },
    async findUserByEmail(tenantId, email) { calls.push(["find", tenantId, email]); return user; },
    async createSession(input) { calls.push(["createSession", input]); return true; },
    async readSession(hash, now) { calls.push(["readSession", hash, now]); return { ...activeUser, expiresAt: "2026-07-14T12:00:00.000Z" }; },
    async revokeSession(hash, now) { calls.push(["revokeSession", hash, now]); },
    async createPasswordResetToken(input) { calls.push(["createPasswordResetToken", input]); },
    async completePasswordReset(input) { calls.push(["completePasswordReset", input]); return true; },
  };
}

test("login normalizes email, verifies the password, and creates a 12-hour opaque session", async () => {
  const repositories = repository();
  const result = await loginWithPassword({
    input: { email: " OWNER@Example.COM ", password: "correct horse battery staple" },
    repositories,
    passwordHasher: { hash: async () => "unused", verify: async (hash, password) => hash === "stored-hash" && password.startsWith("correct") },
    tokenFactory: () => "s".repeat(43),
    now: new Date("2026-07-14T00:00:00Z"),
  });
  assert.equal(result.expiresAt, "2026-07-14T12:00:00.000Z");
  assert.deepEqual(repositories.calls[0], ["find", "tenant", "owner@example.com"]);
  assert.equal((repositories.calls[1] as [string, { expectedPasswordHash: string }])[1].expectedPasswordHash, "stored-hash");
  assert.equal(JSON.stringify(repositories.calls).includes("s".repeat(43)), false);
});

test("login stays generic when a concurrent password reset invalidates session creation", async () => {
  const repositories = { ...repository(), async createSession() { return false; } };
  await assert.rejects(() => loginWithPassword({
    input: { email: "owner@example.com", password: "correct horse battery staple" },
    repositories,
    passwordHasher: { hash: async () => "unused", verify: async () => true },
    tokenFactory: () => "s".repeat(43),
    now: new Date("2026-07-14T00:00:00Z"),
  }), (error: unknown) => error instanceof PlatformAuthError
    && error.code === "invalid_credentials"
    && error.status === 401
    && error.message === "Invalid email or password.");
});

test("unknown email and wrong password return the same generic authentication error and both verify", async () => {
  for (const user of [undefined, activeUser]) {
    let verifies = 0;
    await assert.rejects(() => loginWithPassword({
      input: { email: "owner@example.com", password: "wrong password" },
      repositories: repository(user),
      passwordHasher: { hash: async () => "unused", verify: async () => { verifies += 1; return false; } },
      now: new Date(),
    }), (error: unknown) => error instanceof PlatformAuthError && error.code === "invalid_credentials" && error.status === 401);
    assert.equal(verifies, 1);
  }
});

test("session authentication and logout hash opaque tokens before storage", async () => {
  const repositories = repository();
  const principal = await authenticateSession({ token: "s".repeat(43), repositories, now: new Date("2026-07-14T00:00:00Z") });
  await logoutSession({ token: "s".repeat(43), repositories, now: new Date("2026-07-14T01:00:00Z") });
  assert.equal(principal?.userId, "user");
  assert.equal(JSON.stringify(repositories.calls).includes("s".repeat(43)), false);
});

test("venue authorization follows owner and assigned-staff scope", () => {
  assert.equal(authorizeVenue({ userId: "owner", tenantId: "tenant", role: "owner", venueIds: [] }, "venue-b"), "venue-b");
  assert.equal(authorizeVenue({ userId: "owner", tenantId: "tenant", role: "owner", venueIds: ["venue-a"] }), "venue-a");
  assert.equal(authorizeVenue({ userId: "owner", tenantId: "tenant", role: "owner", venueIds: ["venue-a", "venue-b"] }), undefined);
  assert.equal(authorizeVenue({ userId: "staff", tenantId: "tenant", role: "staff", venueIds: ["venue-a"] }, "venue-b"), undefined);
  assert.equal(authorizeVenue({ userId: "staff", tenantId: "tenant", role: "staff", venueIds: ["venue-a"] }), "venue-a");
  assert.throws(() => requireOwner({ userId: "staff", tenantId: "tenant", role: "staff", venueIds: [] }), PlatformAuthError);
});

test("password reset stores a hash and completion delegates atomic session revocation", async () => {
  const repositories = repository();
  await requestPasswordReset({
    input: { email: " OWNER@Example.com " },
    repositories,
    tokenFactory: () => "r".repeat(43),
    now: new Date("2026-07-14T00:00:00Z"),
  });
  await completePasswordReset({
    resetToken: "r".repeat(43),
    input: { password: "correct horse battery staple" },
    repositories,
    passwordHasher: { hash: async () => "$argon2id$new", verify: async () => false },
    now: new Date("2026-07-14T00:30:00Z"),
  });

  assert.equal(JSON.stringify(repositories.calls).includes("r".repeat(43)), false);
  const createCall = repositories.calls.find((call) => (call as unknown[])[0] === "createPasswordResetToken") as [string, { expiresAt: string }];
  assert.equal(createCall[1].expiresAt, "2026-07-14T01:00:00.000Z");
  const completeCall = repositories.calls.find((call) => (call as unknown[])[0] === "completePasswordReset") as [string, { passwordHash: string }];
  assert.equal(completeCall[1].passwordHash, "$argon2id$new");
});
