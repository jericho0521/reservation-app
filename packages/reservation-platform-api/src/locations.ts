import {
  installationLocationInputSchema,
  installationLocationPatchSchema,
  type InstallationLocationInput,
  type InstallationLocationPatch,
  type InstallationLocationResponse,
  type ListInstallationLocationsResponse,
} from "@reservation-platform/contract-types";
import { requireOwner, type AuthenticatedPrincipal } from "./sessions.js";

export interface InstallationLocationsRepository {
  listLocations(input: {
    tenantId: string;
    venueIds?: readonly string[];
  }): Promise<InstallationLocationResponse[]>;
  createLocation(input: {
    tenantId: string;
    ownerUserId: string;
    location: InstallationLocationInput;
  }): Promise<InstallationLocationResponse>;
  updateLocation(input: {
    tenantId: string;
    locationId: string;
    patch: InstallationLocationPatch;
  }): Promise<InstallationLocationResponse | undefined>;
}

export class OnboardingRepositoryConflictError extends Error {
  constructor(readonly field: "public_slug" | "location_name") {
    super(`${field} already exists.`);
    this.name = "OnboardingRepositoryConflictError";
  }
}

export class OnboardingError extends Error {
  constructor(
    readonly code: "validation_failed" | "conflict" | "not_found",
    readonly status: 400 | 404 | 409,
    message: string,
  ) {
    super(message);
    this.name = "OnboardingError";
  }
}

export async function listInstallationLocations(input: {
  principal: AuthenticatedPrincipal;
  repository: InstallationLocationsRepository;
}): Promise<ListInstallationLocationsResponse> {
  return {
    locations: await input.repository.listLocations({
      tenantId: input.principal.tenantId,
      ...(input.principal.role === "staff" ? { venueIds: input.principal.venueIds } : {}),
    }),
  };
}

export async function createInstallationLocation(input: {
  principal: AuthenticatedPrincipal;
  input: unknown;
  repository: InstallationLocationsRepository;
}): Promise<InstallationLocationResponse> {
  requireOwner(input.principal);
  const parsed = installationLocationInputSchema.safeParse(input.input);
  if (!parsed.success || !isIanaTimezone(parsed.data.timezone)) {
    throw new OnboardingError("validation_failed", 400, "Location details are invalid.");
  }
  try {
    return await input.repository.createLocation({
      tenantId: input.principal.tenantId,
      ownerUserId: input.principal.userId,
      location: normalizeLocation(parsed.data),
    });
  } catch (error) {
    throw mapRepositoryError(error);
  }
}

export async function updateInstallationLocation(input: {
  principal: AuthenticatedPrincipal;
  locationId: string;
  input: unknown;
  repository: InstallationLocationsRepository;
}): Promise<InstallationLocationResponse> {
  requireOwner(input.principal);
  const locationId = input.locationId.trim();
  const parsed = installationLocationPatchSchema.safeParse(input.input);
  if (!uuidPattern.test(locationId) || !parsed.success || (parsed.data.timezone && !isIanaTimezone(parsed.data.timezone))) {
    throw new OnboardingError("validation_failed", 400, "Location details are invalid.");
  }
  try {
    const location = await input.repository.updateLocation({
      tenantId: input.principal.tenantId,
      locationId,
      patch: {
        ...parsed.data,
        ...(parsed.data.name ? { name: parsed.data.name.trim() } : {}),
        ...(parsed.data.address === undefined
          ? {}
          : { address: parsed.data.address === null ? null : parsed.data.address.trim() }),
        ...(parsed.data.timezone ? { timezone: parsed.data.timezone.trim() } : {}),
      },
    });
    if (!location) throw new OnboardingError("not_found", 404, "Location not found.");
    return location;
  } catch (error) {
    if (error instanceof OnboardingError) throw error;
    throw mapRepositoryError(error);
  }
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function isIanaTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value.trim() }).format();
    return true;
  } catch {
    return false;
  }
}

function normalizeLocation(input: InstallationLocationInput): InstallationLocationInput {
  return {
    name: input.name.trim(),
    ...(input.address === undefined ? {} : { address: input.address.trim() }),
    timezone: input.timezone.trim(),
  };
}

function mapRepositoryError(error: unknown): Error {
  if (error instanceof OnboardingRepositoryConflictError) {
    return new OnboardingError(
      "conflict",
      409,
      error.field === "public_slug" ? "Public slug is already in use." : "Location name is already in use.",
    );
  }
  return error instanceof Error ? error : new Error("Location repository failed.");
}
