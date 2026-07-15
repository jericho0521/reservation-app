import assert from "node:assert/strict";
import test from "node:test";

import {
  acceptStaffInvitation,
  authorizeVenue,
  completePasswordReset,
  inviteStaff,
  loginWithPassword,
  requestPasswordReset,
  updateStaffAccess,
  type AuthenticatedPrincipal,
  type PasswordHasher,
  type PlatformSessionRepository,
  type PlatformUserRecord,
  type StaffRepository,
} from "../../packages/reservation-platform-api/src/index.ts";

const tenantId = "tenant-production";
const owner: AuthenticatedPrincipal = { userId: "owner-1", tenantId, role: "owner", venueIds: ["venue-a"] };
const passwordHasher: PasswordHasher = {
  async hash(password) { return `hash:${password}`; },
  async verify(hash, password) { return hash === `hash:${password}`; },
};

test("owner invitation, staff venue denial, reset, and disable form one production auth lifecycle", async () => {
  const repository = memoryAuthRepository();
  const invitation = await inviteStaff({
    principal: owner,
    input: { email: "staff@example.com", displayName: "Staff", venueIds: ["venue-a"] },
    repositories: repository,
    passwordHasher,
    tokenFactory: () => "i".repeat(43),
    now: new Date("2026-07-15T00:00:00Z"),
  });
  assert.equal(invitation.invitationToken, "i".repeat(43));

  await acceptStaffInvitation({
    invitationToken: invitation.invitationToken,
    input: { displayName: "Staff Member", password: "initial staff password" },
    repositories: repository,
    passwordHasher,
    tokenFactory: () => "s".repeat(43),
    now: new Date("2026-07-15T00:10:00Z"),
  });
  const login = await loginWithPassword({
    input: { email: "staff@example.com", password: "initial staff password" },
    repositories: repository,
    passwordHasher,
    tokenFactory: () => "l".repeat(43),
    now: new Date("2026-07-15T00:20:00Z"),
  });
  assert.equal(login.principal.role, "staff");
  assert.equal(authorizeVenue(login.principal, "venue-b"), undefined);

  await requestPasswordReset({
    input: { email: "staff@example.com" },
    repositories: repository,
    tokenFactory: () => "r".repeat(43),
    now: new Date("2026-07-15T00:30:00Z"),
  });
  await completePasswordReset({
    resetToken: "r".repeat(43),
    input: { password: "replacement staff password" },
    repositories: repository,
    passwordHasher,
    now: new Date("2026-07-15T00:40:00Z"),
  });
  await assert.rejects(() => loginWithPassword({
    input: { email: "staff@example.com", password: "initial staff password" },
    repositories: repository,
    passwordHasher,
  }));

  await updateStaffAccess({
    principal: owner,
    userId: invitation.user.userId,
    input: { status: "disabled", venueIds: ["venue-a"] },
    repositories: repository,
    now: new Date("2026-07-15T00:50:00Z"),
  });
  await assert.rejects(() => loginWithPassword({
    input: { email: "staff@example.com", password: "replacement staff password" },
    repositories: repository,
    passwordHasher,
  }));
});

function memoryAuthRepository(): PlatformSessionRepository & StaffRepository {
  const users = new Map<string, PlatformUserRecord>();
  let invitationHash: string | undefined;
  let resetHash: string | undefined;
  users.set(owner.userId, {
    ...owner,
    email: "owner@example.com",
    displayName: "Owner",
    passwordHash: "hash:owner production password",
    status: "active",
  });
  return {
    async readInstallation() { return { installationId: "installation-1", tenantId, domain: "example.test", setupCompleted: true }; },
    async consumeSetupToken() { return undefined; },
    async createFirstOwner() { return undefined; },
    async createUser() { throw new Error("not used"); },
    async findUserByEmail(requestedTenantId, email) {
      return [...users.values()].find((user) => user.tenantId === requestedTenantId && user.email === email && user.status === "active");
    },
    async createSession(input) {
      const user = users.get(input.userId);
      return Boolean(user && user.status === "active" && user.passwordHash === input.expectedPasswordHash);
    },
    async readSession() { return undefined; },
    async revokeSession() {},
    async createPasswordResetToken(input) { resetHash = input.tokenHash; },
    async completePasswordReset(input) {
      if (input.tokenHash !== resetHash) return false;
      const user = [...users.values()].find((candidate) => candidate.email === "staff@example.com");
      if (!user || user.status !== "active") return false;
      users.set(user.userId, { ...user, passwordHash: input.passwordHash });
      resetHash = undefined;
      return true;
    },
    async createStaffInvitation(input) {
      invitationHash = input.tokenHash;
      const user: PlatformUserRecord = {
        userId: "staff-1", tenantId: input.tenantId, email: input.email, displayName: input.displayName,
        passwordHash: input.placeholderPasswordHash, role: "staff", status: "invited", venueIds: [...input.venueIds],
      };
      users.set(user.userId, user);
      return user;
    },
    async acceptStaffInvitation(input) {
      const user = users.get("staff-1");
      if (!user || input.tokenHash !== invitationHash || user.status !== "invited") return undefined;
      const active = { ...user, displayName: input.displayName, passwordHash: input.passwordHash, status: "active" as const };
      users.set(active.userId, active);
      invitationHash = undefined;
      return active;
    },
    async listStaff() { return [...users.values()].filter((user) => user.role === "staff"); },
    async updateStaffAccess(input) {
      const user = users.get(input.userId);
      if (!user || user.tenantId !== input.tenantId || user.role !== "staff") return undefined;
      const updated = { ...user, ...(input.status ? { status: input.status } : {}), venueIds: [...input.venueIds] };
      users.set(updated.userId, updated);
      return updated;
    },
  };
}
