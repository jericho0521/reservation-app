import assert from "node:assert/strict";
import test from "node:test";
import { PlatformAuthError, type AuthenticatedPrincipal, type PlatformSessionRepository } from "./sessions.js";
import { acceptStaffInvitation, inviteStaff, type StaffRepository } from "./staff.js";

const owner: AuthenticatedPrincipal = { userId: "owner", tenantId: "tenant", role: "owner", venueIds: [] };

function repository(): PlatformSessionRepository & StaffRepository & { calls: unknown[] } {
  const calls: unknown[] = [];
  const invited = { userId: "staff", tenantId: "tenant", email: "staff@example.com", displayName: "Staff", passwordHash: "$locked$", role: "staff" as const, status: "invited" as const, venueIds: ["venue-a"] };
  return {
    calls,
    async readInstallation() { return undefined; }, async consumeSetupToken() { return undefined; }, async createFirstOwner() { return undefined; },
    async createUser(input) { calls.push(["createUser", input]); return invited; },
    async findUserByEmail() { return undefined; },
    async createSession(input) { calls.push(["createSession", input]); }, async readSession() { return undefined; }, async revokeSession() {},
    async createStaffInvitation(input) { calls.push(["createStaffInvitation", input]); return invited; },
    async acceptStaffInvitation(input) { calls.push(["acceptStaffInvitation", input]); return { ...invited, displayName: input.displayName, passwordHash: input.passwordHash, status: "active" }; },
  };
}

test("owner invitation stores only a token hash and assigned venues", async () => {
  const repositories = repository();
  const result = await inviteStaff({
    principal: owner,
    input: { email: " STAFF@Example.com ", displayName: " Staff ", venueIds: ["venue-a"] },
    repositories,
    passwordHasher: { hash: async () => "$argon2id$placeholder", verify: async () => false },
    tokenFactory: () => "i".repeat(43),
    now: new Date("2026-07-14T00:00:00Z"),
  });
  assert.equal(result.invitationToken, "i".repeat(43));
  assert.equal(result.expiresAt, "2026-07-15T00:00:00.000Z");
  assert.equal(JSON.stringify(repositories.calls).includes("i".repeat(43)), false);
  assert.equal((repositories.calls[0] as [string, { email: string }])[1].email, "staff@example.com");
  assert.equal((repositories.calls[0] as [string, { placeholderPasswordHash: string }])[1].placeholderPasswordHash, "$argon2id$placeholder");
});

test("staff cannot invite another staff member", async () => {
  await assert.rejects(() => inviteStaff({
    principal: { ...owner, role: "staff" },
    input: { email: "staff@example.com", displayName: "Staff", venueIds: ["venue-a"] },
    repositories: repository(),
    passwordHasher: { hash: async () => "$argon2id$placeholder", verify: async () => false },
    now: new Date(),
  }), (error: unknown) => error instanceof PlatformAuthError && error.code === "owner_required");
});

test("acceptance atomically consumes the invitation and creates a session", async () => {
  const repositories = repository();
  const result = await acceptStaffInvitation({
    invitationToken: "i".repeat(43),
    input: { displayName: "Staff Member", password: "correct horse battery staple" },
    repositories,
    passwordHasher: { hash: async () => "$argon2id$new", verify: async () => false },
    tokenFactory: () => "s".repeat(43),
    now: new Date("2026-07-14T00:00:00Z"),
  });
  assert.equal(result.principal.role, "staff");
  assert.equal(JSON.stringify(repositories.calls).includes("i".repeat(43)), false);
  assert.equal(JSON.stringify(repositories.calls).includes("s".repeat(43)), false);
});
