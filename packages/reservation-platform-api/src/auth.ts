import type { JsonValue, PlatformErrorResponse } from "@reservation-platform/contract-types";
import type { PlatformRequestContext } from "./context.js";

export interface AuthenticatedPlatformPrincipal {
  subjectId: string;
  tenantIds: readonly string[];
  venueIds?: readonly string[];
  roles?: readonly string[];
  scopes?: readonly string[];
}

export interface PlatformTokenClaimMapping {
  subject?: string | readonly string[];
  tenantIds?: string | readonly string[];
  venueIds?: string | readonly string[];
  roles?: string | readonly string[];
  scopes?: string | readonly string[];
}

export interface PrincipalFromTokenClaimsOptions {
  claimNames?: PlatformTokenClaimMapping;
  allowMissingTenants?: boolean;
}

export interface PlatformAuthorizationContext {
  tenantId?: string | null;
  venueId?: string | null;
}

export interface PlatformAuthorizationOptions {
  requireTenant?: boolean;
  requiredRoles?: readonly string[];
  requiredScopes?: readonly string[];
}

export interface AuthorizedPlatformContext {
  principal: AuthenticatedPlatformPrincipal;
  subjectId: string;
  tenantId?: string;
  venueId?: string;
}

export type PlatformContextReadResult<T> = {
  data: T | null | undefined;
  error?: unknown;
};

export type PlatformTenantVenueRepository = {
  getTenant(id: string): Promise<PlatformContextReadResult<unknown>>;
  getVenue(id: string): Promise<PlatformContextReadResult<unknown>>;
};

export interface PlatformTenantVenueValidationOptions {
  requireTenant?: boolean;
}

export type PlatformAuthorizationResult =
  | { ok: true; context: AuthorizedPlatformContext }
  | { ok: false; status: number; body: PlatformErrorResponse };

export type PlatformTenantVenueValidationResult = PlatformAuthorizationResult;

export type PrincipalFromTokenClaimsResult =
  | { ok: true; principal: AuthenticatedPlatformPrincipal }
  | { ok: false; status: number; body: PlatformErrorResponse };

export type PlatformAuthorizationInput = PlatformRequestContext | PlatformAuthorizationContext;

const defaultTokenClaimNames = {
  subject: ["sub"],
  tenantIds: ["tenant_ids"],
  venueIds: ["venue_ids"],
  roles: ["roles"],
  scopes: ["scope", "scopes"],
} as const;

export function principalFromTokenClaims(
  claims: unknown,
  options: PrincipalFromTokenClaimsOptions = {},
): PrincipalFromTokenClaimsResult {
  const record = isRecord(claims) ? claims : {};
  const claimNames = options.claimNames ?? {};

  const subjectId = normalizeOptional(
    firstStringClaim(record, claimNames.subject ?? defaultTokenClaimNames.subject),
  );

  if (subjectId === undefined) {
    return reject(401, "unauthorized", "Authenticated token is missing a subject.");
  }

  const tenantIds = claimValues(record, claimNames.tenantIds ?? defaultTokenClaimNames.tenantIds);
  if (tenantIds.length === 0 && options.allowMissingTenants !== true) {
    return reject(401, "unauthorized", "Authenticated token is missing tenant claims.");
  }

  const venueIds = claimValues(record, claimNames.venueIds ?? defaultTokenClaimNames.venueIds);
  const roles = claimValues(record, claimNames.roles ?? defaultTokenClaimNames.roles);
  const scopes = claimValues(record, claimNames.scopes ?? defaultTokenClaimNames.scopes);

  return {
    ok: true,
    principal: {
      subjectId,
      tenantIds,
      ...(venueIds.length === 0 ? {} : { venueIds }),
      roles,
      scopes,
    },
  };
}

export function authorizePlatformContext(
  principal: AuthenticatedPlatformPrincipal | null | undefined,
  context: PlatformAuthorizationInput,
  options: PlatformAuthorizationOptions = {},
): PlatformAuthorizationResult {
  if (principal === null || principal === undefined) {
    return reject(401, "unauthorized", "Missing authenticated principal.");
  }

  const subjectId = normalizeRequired(principal.subjectId);
  if (subjectId === undefined) {
    return reject(401, "unauthorized", "Authenticated principal is missing a subject.");
  }

  const tenantId = normalizeOptional(context.tenantId);
  const venueId = normalizeOptional(context.venueId);
  const tenantIds = normalizeList(principal.tenantIds);
  const venueIds = principal.venueIds === undefined ? undefined : normalizeList(principal.venueIds);
  const roles = normalizeList(principal.roles ?? []);
  const scopes = normalizeList(principal.scopes ?? []);
  const requiredRoles = normalizeList(options.requiredRoles ?? []);
  const requiredScopes = normalizeList(options.requiredScopes ?? []);

  if (options.requireTenant === true && tenantId === undefined) {
    return reject(
      400,
      "validation_failed",
      "Missing tenant context.",
      { reason: "tenant_required" },
    );
  }

  if (tenantId !== undefined && !tenantIds.includes(tenantId)) {
    return reject(
      403,
      "forbidden",
      "Authenticated principal is not allowed to access this tenant.",
      { tenant_id: tenantId },
    );
  }

  if (venueId !== undefined && venueIds !== undefined && !venueIds.includes(venueId)) {
    return reject(
      403,
      "forbidden",
      "Authenticated principal is not allowed to access this venue.",
      { venue_id: venueId },
    );
  }

  const missingRoles = requiredRoles.filter((role) => !roles.includes(role));
  if (missingRoles.length > 0) {
    return reject(
      403,
      "forbidden",
      "Authenticated principal is missing required roles.",
      { missing_roles: missingRoles },
    );
  }

  const missingScopes = requiredScopes.filter((scope) => !scopes.includes(scope));
  if (missingScopes.length > 0) {
    return reject(
      403,
      "forbidden",
      "Authenticated principal is missing required scopes.",
      { missing_scopes: missingScopes },
    );
  }

  return {
    ok: true,
    context: {
      principal: {
        ...principal,
        subjectId,
        tenantIds,
        ...(venueIds === undefined ? {} : { venueIds }),
        roles,
        scopes,
      },
      subjectId,
      ...(tenantId === undefined ? {} : { tenantId }),
      ...(venueId === undefined ? {} : { venueId }),
    },
  };
}

export async function validatePlatformTenantVenueContext(
  repository: PlatformTenantVenueRepository,
  authorizedContext: AuthorizedPlatformContext,
  options: PlatformTenantVenueValidationOptions = {},
): Promise<PlatformTenantVenueValidationResult> {
  const tenantId = normalizeOptional(authorizedContext.tenantId);
  const venueId = normalizeOptional(authorizedContext.venueId);

  if (options.requireTenant === true && tenantId === undefined) {
    return reject(
      400,
      "validation_failed",
      "Missing tenant context.",
      { reason: "tenant_required" },
    );
  }

  if (tenantId !== undefined) {
    const tenantResult = await readPlatformContextRecord(
      () => repository.getTenant(tenantId),
      "tenant",
    );

    if (tenantResult.ok === false) {
      return tenantResult.result;
    }
  }

  if (venueId !== undefined) {
    const venueResult = await readPlatformContextRecord(
      () => repository.getVenue(venueId),
      "venue",
    );

    if (venueResult.ok === false) {
      return venueResult.result;
    }

    const venueTenantId = tenantIdFromRecord(venueResult.data);
    if (tenantId !== undefined && venueTenantId === undefined) {
      return reject(
        500,
        "internal_error",
        "Failed to validate venue context.",
        { reason: "venue_tenant_missing" },
      );
    }

    if (tenantId !== undefined && venueTenantId !== tenantId) {
      return reject(
        403,
        "forbidden",
        "Venue does not belong to the requested tenant.",
        { reason: "venue_tenant_mismatch", tenant_id: tenantId, venue_id: venueId },
      );
    }
  }

  return {
    ok: true,
    context: {
      ...authorizedContext,
      ...(tenantId === undefined ? {} : { tenantId }),
      ...(venueId === undefined ? {} : { venueId }),
    },
  };
}

function reject(
  status: number,
  code: PlatformErrorResponse["error"]["code"],
  message: string,
  details?: JsonValue,
): { ok: false; status: number; body: PlatformErrorResponse } {
  const body: PlatformErrorResponse = {
    error: {
      code,
      message,
      status,
      ...(details === undefined ? {} : { details }),
    },
  };

  return {
    ok: false,
    status,
    body,
  };
}

function normalizeRequired(value: string) {
  return normalizeOptional(value);
}

function normalizeOptional(value: string | null | undefined) {
  if (value === null || value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function normalizeList(values: readonly string[]) {
  return Array.from(new Set(values.map(normalizeRequired).filter(isPresent)));
}

function claimValues(
  claims: Record<string, unknown>,
  names: string | readonly string[],
) {
  return normalizeList(claimNameList(names).flatMap((name) => valuesFromClaim(claims[name])));
}

function firstStringClaim(
  claims: Record<string, unknown>,
  names: string | readonly string[],
) {
  for (const name of claimNameList(names)) {
    const value = claims[name];
    if (typeof value === "string") {
      return value;
    }
  }

  return undefined;
}

function claimNameList(names: string | readonly string[]) {
  return Array.isArray(names) ? names : [names];
}

function valuesFromClaim(value: unknown): readonly string[] {
  if (typeof value === "string") {
    return splitClaimString(value);
  }

  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }

  return [];
}

function splitClaimString(value: string) {
  return value.split(/[\s,]+/u);
}

function isPresent(value: string | undefined): value is string {
  return value !== undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function readPlatformContextRecord(
  read: () => Promise<PlatformContextReadResult<unknown>> | undefined,
  kind: "tenant" | "venue",
): Promise<
  | { ok: true; data: unknown }
  | { ok: false; result: PlatformTenantVenueValidationResult }
> {
  let result: PlatformContextReadResult<unknown> | undefined;
  try {
    result = await read();
  } catch {
    return {
      ok: false,
      result: reject(
        500,
        "internal_error",
        `Failed to validate ${kind} context.`,
        { reason: `${kind}_validation_failed` },
      ),
    };
  }

  if (result?.error !== undefined) {
    if (isNotFoundError(result.error)) {
      return inaccessibleContext(kind);
    }

    return {
      ok: false,
      result: reject(
        500,
        "internal_error",
        `Failed to validate ${kind} context.`,
        { reason: `${kind}_validation_failed` },
      ),
    };
  }

  if (result?.data === null || result?.data === undefined) {
    return inaccessibleContext(kind);
  }

  return { ok: true, data: result.data };
}

function inaccessibleContext(kind: "tenant" | "venue") {
  return {
    ok: false as const,
    result: reject(
      403,
      "forbidden",
      `Authenticated principal is not allowed to access this ${kind}.`,
      { reason: `${kind}_inaccessible` },
    ),
  };
}

function isNotFoundError(error: unknown) {
  const record = error && typeof error === "object" ? error as { code?: unknown; status?: unknown } : {};
  return record.status === 404 || record.code === "PGRST116";
}

function tenantIdFromRecord(row: unknown) {
  if (!row || typeof row !== "object") {
    return undefined;
  }

  const record = row as { tenant_id?: unknown; tenantId?: unknown };
  return typeof record.tenant_id === "string"
    ? normalizeOptional(record.tenant_id)
    : typeof record.tenantId === "string"
      ? normalizeOptional(record.tenantId)
      : undefined;
}
