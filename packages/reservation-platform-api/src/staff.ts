import {
  PlatformAuthError,
  argon2idPasswordHasher,
  createOpaqueToken,
  createSessionResult,
  hashOpaqueToken,
  isOpaqueToken,
  normalizeDisplayName,
  normalizeEmail,
  requireOwner,
  validatePassword,
  type AuthenticatedPrincipal,
  type PasswordHasher,
  type PlatformSessionRepository,
  type PlatformUserRecord,
  type SessionTokenResult,
} from "./sessions.js";

export interface StaffRepository {
  createStaffInvitation(input: {
    tenantId: string;
    actorUserId: string;
    email: string;
    displayName: string;
    placeholderPasswordHash: string;
    venueIds: readonly string[];
    tokenHash: string;
    expiresAt: string;
  }): Promise<PlatformUserRecord>;
  acceptStaffInvitation(input: {
    tokenHash: string;
    now: string;
    displayName: string;
    passwordHash: string;
  }): Promise<PlatformUserRecord | undefined>;
  listStaff(tenantId: string): Promise<StaffMemberRecord[]>;
  updateStaffAccess(input: {
    tenantId: string;
    actorUserId: string;
    userId: string;
    status?: "active" | "disabled";
    venueIds: readonly string[];
    now: string;
  }): Promise<StaffMemberRecord | undefined>;
}

export interface StaffMemberRecord {
  userId: string;
  email: string;
  displayName: string;
  status: "invited" | "active" | "disabled";
  venueIds: readonly string[];
}

export async function inviteStaff(input: {
  principal: AuthenticatedPrincipal;
  input: { email: string; displayName: string; venueIds: readonly string[] };
  repositories: StaffRepository;
  passwordHasher?: PasswordHasher;
  tokenFactory?: () => string;
  now?: Date;
}): Promise<{ invitationToken: string; expiresAt: string; user: PlatformUserRecord }> {
  requireOwner(input.principal);
  const email = normalizeEmail(input.input.email);
  const displayName = normalizeDisplayName(input.input.displayName);
  const venueIds = [...new Set(input.input.venueIds.map((venueId) => venueId.trim()).filter(Boolean))];
  if (!email || !displayName || venueIds.length === 0) {
    throw new PlatformAuthError("validation_failed", 400, "Staff invitation details are invalid.");
  }
  const invitationToken = (input.tokenFactory ?? createOpaqueToken)();
  if (!isOpaqueToken(invitationToken)) {
    throw new PlatformAuthError("validation_failed", 400, "Invitation token generation failed.");
  }
  const now = input.now ?? new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1_000).toISOString();
  const tokenHash = hashOpaqueToken(invitationToken);
  const placeholderPasswordHash = await (input.passwordHasher ?? argon2idPasswordHasher).hash(invitationToken);
  const user = await input.repositories.createStaffInvitation({
    tenantId: input.principal.tenantId,
    actorUserId: input.principal.userId,
    email,
    displayName,
    placeholderPasswordHash,
    venueIds,
    tokenHash,
    expiresAt,
  });
  return { invitationToken, expiresAt, user };
}

export async function acceptStaffInvitation(input: {
  invitationToken: string;
  input: { displayName: string; password: string };
  repositories: StaffRepository & Pick<PlatformSessionRepository, "createSession">;
  passwordHasher?: PasswordHasher;
  tokenFactory?: () => string;
  now?: Date;
}): Promise<SessionTokenResult> {
  const displayName = normalizeDisplayName(input.input.displayName);
  if (!isOpaqueToken(input.invitationToken) || !displayName || !validatePassword(input.input.password)) {
    throw new PlatformAuthError("validation_failed", 400, "Staff invitation acceptance details are invalid.");
  }
  const now = input.now ?? new Date();
  const passwordHash = await (input.passwordHasher ?? argon2idPasswordHasher).hash(input.input.password);
  const user = await input.repositories.acceptStaffInvitation({
    tokenHash: hashOpaqueToken(input.invitationToken),
    now: now.toISOString(),
    displayName,
    passwordHash,
  });
  if (!user || user.status !== "active") {
    throw new PlatformAuthError("invitation_invalid", 400, "Staff invitation is invalid or expired.");
  }
  return createSessionResult({
    user,
    repositories: input.repositories,
    tokenFactory: input.tokenFactory,
    now,
  });
}

export async function listStaffMembers(input: {
  principal: AuthenticatedPrincipal;
  repositories: Pick<StaffRepository, "listStaff">;
}): Promise<StaffMemberRecord[]> {
  requireOwner(input.principal);
  return input.repositories.listStaff(input.principal.tenantId);
}

export async function updateStaffAccess(input: {
  principal: AuthenticatedPrincipal;
  userId: string;
  input: { status?: "active" | "disabled"; venueIds: readonly string[] };
  repositories: Pick<StaffRepository, "updateStaffAccess">;
  now?: Date;
}): Promise<StaffMemberRecord> {
  requireOwner(input.principal);
  const userId = input.userId.trim();
  const venueIds = [...new Set(input.input.venueIds.map((venueId) => venueId.trim()).filter(Boolean))];
  if (!userId || venueIds.length === 0) {
    throw new PlatformAuthError("validation_failed", 400, "Staff location assignments are invalid.");
  }
  const user = await input.repositories.updateStaffAccess({
    tenantId: input.principal.tenantId,
    actorUserId: input.principal.userId,
    userId,
    ...(input.input.status ? { status: input.input.status } : {}),
    venueIds,
    now: (input.now ?? new Date()).toISOString(),
  });
  if (!user) throw new PlatformAuthError("validation_failed", 404, "Staff account was not found.");
  return user;
}
