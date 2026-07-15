import {
  PlatformAuthError,
  argon2idPasswordHasher,
  createSessionResult,
  hashOpaqueToken,
  isOpaqueToken,
  normalizeDisplayName,
  normalizeEmail,
  validatePassword,
  type PasswordHasher,
  type PlatformSessionRepository,
  type SessionTokenResult,
} from "./sessions.js";

export async function createFirstOwner(input: {
  setupToken: string;
  input: { email: string; displayName: string; password: string };
  repositories: PlatformSessionRepository;
  passwordHasher?: PasswordHasher;
  tokenFactory?: () => string;
  now?: Date;
}): Promise<SessionTokenResult> {
  const email = normalizeEmail(input.input.email);
  const displayName = normalizeDisplayName(input.input.displayName);
  if (!isOpaqueToken(input.setupToken) || !email || !displayName || !validatePassword(input.input.password)) {
    throw new PlatformAuthError("validation_failed", 400, "Owner setup details are invalid.");
  }

  const now = input.now ?? new Date();
  const passwordHash = await (input.passwordHasher ?? argon2idPasswordHasher).hash(input.input.password);
  const result = await input.repositories.createFirstOwner({
    tokenHash: hashOpaqueToken(input.setupToken),
    now: now.toISOString(),
    email,
    displayName,
    passwordHash,
  });
  if (!result) {
    throw new PlatformAuthError("setup_unavailable", 409, "Installation setup is unavailable.");
  }

  return createSessionResult({
    user: result.user,
    repositories: input.repositories,
    tokenFactory: input.tokenFactory,
    now,
  });
}
