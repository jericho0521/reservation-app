import { createHash, randomBytes } from "node:crypto";
import { createRequire } from "node:module";

export type PlatformUserRole = "owner" | "staff";

export interface AuthenticatedPrincipal {
  userId: string;
  tenantId: string;
  role: PlatformUserRole;
  venueIds: readonly string[];
}

export interface InstallationRecord {
  installationId: string;
  tenantId: string;
  domain: string;
  setupCompleted: boolean;
}

export interface PlatformUserRecord extends AuthenticatedPrincipal {
  email: string;
  displayName: string;
  passwordHash: string;
  status: "invited" | "active" | "disabled";
}

export interface CreateFirstOwnerStorageInput {
  tokenHash: string;
  now: string;
  email: string;
  displayName: string;
  passwordHash: string;
}

export interface CreateFirstOwnerStorageResult {
  installation: InstallationRecord;
  user: PlatformUserRecord;
}

export interface PlatformSessionRepository {
  readInstallation(): Promise<InstallationRecord | undefined>;
  consumeSetupToken(input: { tokenHash: string; now: string }): Promise<InstallationRecord | undefined>;
  createFirstOwner(input: CreateFirstOwnerStorageInput): Promise<CreateFirstOwnerStorageResult | undefined>;
  createUser(input: Omit<PlatformUserRecord, "userId" | "venueIds"> & { venueIds?: readonly string[] }): Promise<PlatformUserRecord>;
  findUserByEmail(tenantId: string, email: string): Promise<PlatformUserRecord | undefined>;
  createSession(input: { userId: string; tokenHash: string; expiresAt: string }): Promise<void>;
  readSession(tokenHash: string, now: string): Promise<AuthenticatedPrincipal | undefined>;
  revokeSession(tokenHash: string, now: string): Promise<void>;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
}

export interface SessionTokenResult {
  token: string;
  tokenHash: string;
  expiresAt: string;
  principal: AuthenticatedPrincipal;
}

export type PlatformAuthErrorCode =
  | "invalid_credentials"
  | "owner_required"
  | "setup_unavailable"
  | "validation_failed"
  | "invitation_invalid";

export class PlatformAuthError extends Error {
  constructor(
    readonly code: PlatformAuthErrorCode,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "PlatformAuthError";
  }
}

export class PlatformAuthorizationError extends PlatformAuthError {
  constructor(code: "owner_required") {
    super(code, 403, "Owner access is required.");
    this.name = "PlatformAuthorizationError";
  }
}

type Argon2Module = {
  Algorithm: { Argon2id: number };
  hash(password: string, options: Record<string, number>): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
};

const require = createRequire(import.meta.url);
const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/u;
const opaqueTokenPattern = /^[A-Za-z0-9_-]{43}$/u;
const sessionDurationMs = 12 * 60 * 60 * 1_000;
const dummyPasswordHash = "$argon2id$v=19$m=19456,t=2,p=1$cGxhdGZvcm0tc2FsdA$U1CrVYwBEHYfB7dWn7jITXz4SJ0kydHDKcGG4VlB+EY";

export const argon2idPasswordHasher: PasswordHasher = {
  async hash(password) {
    const argon2 = loadArgon2();
    return argon2.hash(password, {
      algorithm: argon2.Algorithm.Argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      outputLen: 32,
      parallelism: 1,
    });
  },
  async verify(hash, password) {
    return loadArgon2().verify(hash, password);
  },
};

export async function loginWithPassword(input: {
  input: { email: string; password: string };
  repositories: PlatformSessionRepository;
  passwordHasher?: PasswordHasher;
  tokenFactory?: () => string;
  now?: Date;
}): Promise<SessionTokenResult> {
  const now = input.now ?? new Date();
  const passwordHasher = input.passwordHasher ?? argon2idPasswordHasher;
  const email = normalizeEmail(input.input.email);
  const installation = await input.repositories.readInstallation();
  const user = email && installation?.setupCompleted
    ? await input.repositories.findUserByEmail(installation.tenantId, email)
    : undefined;
  let passwordMatches = false;
  try {
    passwordMatches = await passwordHasher.verify(user?.passwordHash ?? dummyPasswordHash, input.input.password);
  } catch {
    passwordMatches = false;
  }
  if (!user || user.status !== "active" || !passwordMatches) {
    throw new PlatformAuthError("invalid_credentials", 401, "Invalid email or password.");
  }

  return createSessionResult({
    user,
    repositories: input.repositories,
    tokenFactory: input.tokenFactory,
    now,
  });
}

export async function authenticateSession(input: {
  token: string;
  repositories: PlatformSessionRepository;
  now?: Date;
}): Promise<AuthenticatedPrincipal | undefined> {
  if (!isOpaqueToken(input.token)) return undefined;
  return input.repositories.readSession(hashOpaqueToken(input.token), (input.now ?? new Date()).toISOString());
}

export async function logoutSession(input: {
  token: string;
  repositories: PlatformSessionRepository;
  now?: Date;
}): Promise<void> {
  if (!isOpaqueToken(input.token)) return;
  await input.repositories.revokeSession(hashOpaqueToken(input.token), (input.now ?? new Date()).toISOString());
}

export function authorizeVenue(
  principal: AuthenticatedPrincipal,
  requestedVenueId?: string,
): string | undefined {
  if (principal.role === "owner") return requestedVenueId;
  if (!requestedVenueId) {
    return principal.venueIds.length === 1 ? principal.venueIds[0] : undefined;
  }
  return principal.venueIds.includes(requestedVenueId) ? requestedVenueId : undefined;
}

export function requireOwner(principal: AuthenticatedPrincipal): AuthenticatedPrincipal {
  if (principal.role !== "owner") throw new PlatformAuthorizationError("owner_required");
  return principal;
}

export function normalizeEmail(value: string): string | undefined {
  const email = value.trim().toLowerCase();
  return emailPattern.test(email) ? email : undefined;
}

export function normalizeDisplayName(value: string): string | undefined {
  const displayName = value.trim();
  return displayName.length > 0 ? displayName : undefined;
}

export function validatePassword(password: string): boolean {
  return password.length >= 12;
}

export function isOpaqueToken(token: string): boolean {
  return opaqueTokenPattern.test(token);
}

export function hashOpaqueToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function createOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function createSessionResult(input: {
  user: PlatformUserRecord;
  repositories: Pick<PlatformSessionRepository, "createSession">;
  tokenFactory?: () => string;
  now: Date;
}): Promise<SessionTokenResult> {
  const token = (input.tokenFactory ?? createOpaqueToken)();
  if (!isOpaqueToken(token)) {
    throw new PlatformAuthError("validation_failed", 400, "Session token generation failed.");
  }
  const tokenHash = hashOpaqueToken(token);
  const expiresAt = new Date(input.now.getTime() + sessionDurationMs).toISOString();
  const principal = principalFromUser(input.user);
  await input.repositories.createSession({ userId: input.user.userId, tokenHash, expiresAt });
  return { token, tokenHash, expiresAt, principal };
}

function principalFromUser(user: PlatformUserRecord): AuthenticatedPrincipal {
  return {
    userId: user.userId,
    tenantId: user.tenantId,
    role: user.role,
    venueIds: user.venueIds,
  };
}

function loadArgon2(): Argon2Module {
  return require("@node-rs/argon2") as Argon2Module;
}
