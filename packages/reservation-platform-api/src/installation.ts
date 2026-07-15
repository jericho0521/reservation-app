import {
  PlatformAuthError,
  argon2idPasswordHasher,
  createSessionResult,
  hashOpaqueToken,
  isOpaqueToken,
  normalizeDisplayName,
  normalizeEmail,
  validatePassword,
  requireOwner,
  type AuthenticatedPrincipal,
  type PasswordHasher,
  type PlatformSessionRepository,
  type SessionTokenResult,
} from "./sessions.js";
import {
  installationBusinessInputSchema,
  type InstallationBusinessInput,
  type InstallationBusinessResponse,
} from "@reservation-platform/contract-types";
import {
  OnboardingError,
  OnboardingRepositoryConflictError,
  isIanaTimezone,
} from "./locations.js";

export interface InstallationBusinessRepository {
  readBusiness(tenantId: string): Promise<InstallationBusinessResponse | undefined>;
  configureBusiness(input: {
    tenantId: string;
    ownerUserId: string;
    business: InstallationBusinessInput;
  }): Promise<InstallationBusinessResponse>;
}

export async function readInstallationBusiness(input: {
  principal: AuthenticatedPrincipal;
  repository: InstallationBusinessRepository;
}): Promise<InstallationBusinessResponse> {
  requireOwner(input.principal);
  const business = await input.repository.readBusiness(input.principal.tenantId);
  if (!business) throw new OnboardingError("not_found", 404, "Business is not configured.");
  return business;
}

export async function configureInstallationBusiness(input: {
  principal: AuthenticatedPrincipal;
  input: unknown;
  repository: InstallationBusinessRepository;
}): Promise<InstallationBusinessResponse> {
  requireOwner(input.principal);
  const parsed = installationBusinessInputSchema.safeParse(input.input);
  const publicSlug = parsed.success ? normalizePublicSlug(parsed.data.public_slug) : undefined;
  if (!parsed.success || !publicSlug || !isIanaTimezone(parsed.data.timezone)) {
    throw new OnboardingError("validation_failed", 400, "Business details are invalid.");
  }
  try {
    return await input.repository.configureBusiness({
      tenantId: input.principal.tenantId,
      ownerUserId: input.principal.userId,
      business: {
        name: parsed.data.name.trim(),
        public_slug: publicSlug,
        timezone: parsed.data.timezone.trim(),
        location: {
          name: parsed.data.location.name.trim(),
          ...(parsed.data.location.address === undefined
            ? {}
            : { address: parsed.data.location.address.trim() }),
        },
      },
    });
  } catch (error) {
    if (error instanceof OnboardingRepositoryConflictError) {
      throw new OnboardingError(
        "conflict",
        409,
        error.field === "public_slug" ? "Public slug is already in use." : "Location name is already in use.",
      );
    }
    throw error;
  }
}

export function normalizePublicSlug(value: string): string | undefined {
  const slug = value.trim().toLowerCase();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug) ? slug : undefined;
}

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
