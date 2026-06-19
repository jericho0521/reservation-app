import { NextResponse } from "next/server";
import { supabaseAdmin, MissingSupabaseServiceRoleKeyError } from "@/lib/supabase-admin";
import {
  requireAuthenticatedSupabase,
  type AuthenticatedSupabase,
} from "@/app/api/api-utils";
import type { JsonValue, PlatformErrorCode } from "@reservation-platform/contract-types";
import {
  beginIdempotentMutation,
  commitIdempotentMutation,
  createJsonRequestFingerprint,
  mapLegacyErrorPayload,
  platformErrorBody,
  platformPayloadFromLegacy,
  requirePlatformBearerToken,
  requireIdempotencyKey,
  readPlatformRequestContext,
  readJsonResponse,
  validatePlatformTenantVenueContext,
  type AuthorizedPlatformContext,
  type IdempotencyCommitRecord,
  type IdempotencyRecord,
  type IdempotencyRepository,
  type PlatformTenantVenueRepository,
} from "@reservation-platform/api";
import {
  createSupabaseIdempotencyRepository,
  createSupabaseTenantVenueRepository,
} from "@project-play/reservations-supabase";

export const backendRuntimeServiceApiKeyEnvName = "RESERVATION_PLATFORM_SERVICE_API_KEY";

export function platformJsonError(
  code: PlatformErrorCode,
  message: string,
  status: number,
  details?: unknown,
) {
  return NextResponse.json(platformErrorBody(code, message, status, details), { status });
}

export async function platformResponseFromLegacy(response: Response, mapSuccess: (payload: unknown) => unknown) {
  const { payload, status } = await platformPayloadFromLegacy(response, mapSuccess);
  return NextResponse.json(payload, { status });
}

export async function readOptionalJsonBody(request: Request) {
  if (!request.body) {
    return {};
  }

  const text = await request.text();
  if (text.trim().length === 0) {
    return {};
  }

  return JSON.parse(text);
}

export function platformRequestContextFromRequest(request: Request) {
  return readPlatformRequestContext(request.headers);
}

export function requireRequestIdempotencyKey(request: Request) {
  return requireIdempotencyKey(platformRequestContextFromRequest(request));
}

export type PlatformAuthenticatedSupabaseContext = {
  response: null;
  supabase: AuthenticatedSupabase;
  user: unknown;
};

type PlatformAuthenticatedSupabaseAuthResult = PlatformAuthenticatedSupabaseContext | {
  response: Response;
  supabase: AuthenticatedSupabase;
  user: null;
};

export interface PlatformAuthenticatedSupabaseOptions {
  authenticate?: () => Promise<PlatformAuthenticatedSupabaseAuthResult>;
}

export async function requirePlatformAuthenticatedSupabase(
  options: PlatformAuthenticatedSupabaseOptions = {},
) {
  const authenticate = options.authenticate ?? requireAuthenticatedSupabase;
  const auth = await authenticate();
  if (auth.response) {
    return platformJsonError("unauthorized", "Authentication is required.", 401);
  }

  return { context: auth };
}

export interface PlatformTenantVenueContextValidationOptions {
  repository?: PlatformTenantVenueRepository | (() => PlatformTenantVenueRepository);
  requireTenant?: boolean;
  user?: unknown;
}

export type PlatformTenantVenueContextValidationSuccess = {
  context: AuthorizedPlatformContext;
};

export interface PlatformAuthenticatedSupabaseWithTenantContextOptions
  extends PlatformAuthenticatedSupabaseOptions,
    PlatformTenantVenueContextValidationOptions {}

export async function validatePlatformRequestTenantVenueContext(
  request: Request,
  options: PlatformTenantVenueContextValidationOptions = {},
): Promise<Response | PlatformTenantVenueContextValidationSuccess> {
  const requestContext = platformRequestContextFromRequest(request);
  const hostAuthCompatibilityContext = createHostAuthCompatibilityTenantVenueContext(
    requestContext,
    options.user,
  );
  if (options.requireTenant === true && hostAuthCompatibilityContext.tenantId === undefined) {
    return platformJsonError(
      "validation_failed",
      "Missing tenant context.",
      400,
      { reason: "tenant_required" },
    );
  }

  if (
    hostAuthCompatibilityContext.tenantId === undefined
    && hostAuthCompatibilityContext.venueId === undefined
  ) {
    return { context: hostAuthCompatibilityContext };
  }

  const claimAuthorizationError = validateHostAuthCompatibilityClaims(
    hostAuthCompatibilityContext,
  );
  if (claimAuthorizationError) {
    return claimAuthorizationError;
  }

  let repository: PlatformTenantVenueRepository;

  try {
    repository = resolveTenantVenueContextRepository(options.repository);
  } catch {
    return platformJsonError(
      "internal_error",
      "Reservation platform tenant context validation is unavailable.",
      500,
    );
  }

  const result = await validatePlatformTenantVenueContext(
    repository,
    hostAuthCompatibilityContext,
    { requireTenant: options.requireTenant },
  );

  if (!result.ok) {
    return NextResponse.json(result.body, { status: result.status });
  }

  return { context: result.context };
}

export async function requirePlatformAuthenticatedSupabaseWithTenantContext(
  request: Request,
  options: PlatformAuthenticatedSupabaseWithTenantContextOptions = {},
) {
  const auth = await requirePlatformAuthenticatedSupabase(options);
  if (auth instanceof Response) {
    return auth;
  }

  const tenantVenueContext = await validatePlatformRequestTenantVenueContext(request, {
    ...options,
    user: auth.context.user,
  });
  if (tenantVenueContext instanceof Response) {
    return tenantVenueContext;
  }

  return { context: auth.context };
}

export interface PlatformServiceBearerAuthOptions {
  env?: NodeJS.ProcessEnv;
  serviceApiKey?: string | null;
}

export function resolveBackendRuntimeServiceApiKey(env: NodeJS.ProcessEnv = process.env) {
  const value = env[backendRuntimeServiceApiKeyEnvName]?.trim();
  return value && value.length > 0 ? value : null;
}

export function requirePlatformServiceBearerAuth(
  request: Request,
  options: PlatformServiceBearerAuthOptions = {},
): Response | null {
  const context = platformRequestContextFromRequest(request);
  const bearerToken = requirePlatformBearerToken(context);

  if (!bearerToken.ok) {
    return NextResponse.json({ error: bearerToken.error }, { status: bearerToken.error.status });
  }

  const serviceApiKey = options.serviceApiKey === undefined
    ? resolveBackendRuntimeServiceApiKey(options.env)
    : normalizeServiceApiKey(options.serviceApiKey);

  if (serviceApiKey === null) {
    return platformJsonError(
      "internal_error",
      "Reservation platform service authentication is unavailable.",
      500,
    );
  }

  if (!serviceApiKeysMatch(bearerToken.token, serviceApiKey)) {
    return platformJsonError("unauthorized", "Invalid bearer token.", 401);
  }

  return null;
}

export function requireTenantScopedRecordBinding(): Response | null {
  return platformJsonError(
    "validation_failed",
    "Tenant-scoped record mutation is unavailable until reservation records are bound to tenant context.",
    400,
    { reason: "tenant_scoped_record_binding_unavailable" },
  );
}

export function createPlatformServiceBearerAuthPreflight(
  request: Request,
  options: PlatformServiceBearerAuthOptions = {},
) {
  return () => requirePlatformServiceBearerAuth(request, options);
}

export interface JsonIdempotentMutationOptions<PreflightContext = unknown> {
  request: Request;
  repository: IdempotencyRepository | (() => IdempotencyRepository);
  beforeIdempotency?: () => Promise<Response | { response?: Response | null; context?: PreflightContext } | null | undefined> | Response | { response?: Response | null; context?: PreflightContext } | null | undefined;
  mutate: (body: unknown, preflightContext: PreflightContext | undefined) => Promise<Response> | Response;
}

export async function runJsonMutationIdempotently<PreflightContext = unknown>({
  request,
  repository,
  beforeIdempotency,
  mutate,
}: JsonIdempotentMutationOptions<PreflightContext>) {
  const context = platformRequestContextFromRequest(request);
  const requiredKey = requireIdempotencyKey(context);
  if (!requiredKey.ok) {
    return NextResponse.json(requiredKey.body, { status: requiredKey.status });
  }

  const preflight = await beforeIdempotency?.();
  if (preflight instanceof Response) {
    return preflight;
  }
  if (preflight?.response) {
    return preflight.response;
  }

  const body = await readOptionalJsonBody(request);
  const idempotencyRepository = typeof repository === "function" ? repository() : repository;
  const url = new URL(request.url);
  const begin = await beginIdempotentMutation(idempotencyRepository, {
    key: requiredKey.key,
    tenantId: context.tenantId,
    method: request.method,
    path: url.pathname,
    fingerprint: createJsonRequestFingerprint(body as JsonValue),
  });

  if (begin.action === "replay") {
    return NextResponse.json(begin.body, { status: begin.status });
  }

  if (begin.action === "reject") {
    return NextResponse.json(begin.body, { status: begin.status });
  }

  const response = await mutate(body, preflight?.context);
  const responseBody = await readJsonResponse(response);
  if (
    (response.status >= 200 && response.status < 300)
    || (response.status >= 400 && response.status < 500)
  ) {
    await commitIdempotentMutation(idempotencyRepository, begin.token, {
      status: response.status,
      body: responseBody,
    });
  }

  return NextResponse.json(responseBody, { status: response.status });
}

export class InProcessCompatibilityIdempotencyRepository implements IdempotencyRepository {
  private readonly records = new Map<string, IdempotencyRecord>();

  claimInProgress(record: IdempotencyRecord) {
    const existing = this.records.get(record.key);
    if (existing) {
      return existing;
    }

    this.records.set(record.key, record);
    return null;
  }

  storeCompleted(record: IdempotencyCommitRecord) {
    this.records.set(record.key, record);
  }
}

let backendRuntimeIdempotencyRepository: IdempotencyRepository | null = null;
let inProcessLocalDevTestIdempotencyRepository: InProcessCompatibilityIdempotencyRepository | null = null;
let backendRuntimeTenantVenueRepository: PlatformTenantVenueRepository | null = null;

function canUseInProcessIdempotencyFallback() {
  return process.env.NODE_ENV !== "production";
}

function normalizeServiceApiKey(value: string | null) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function serviceApiKeysMatch(actual: string, expected: string) {
  const actualBytes = new TextEncoder().encode(actual);
  const expectedBytes = new TextEncoder().encode(expected);
  const length = Math.max(actualBytes.length, expectedBytes.length);
  let mismatch = actualBytes.length ^ expectedBytes.length;

  for (let index = 0; index < length; index += 1) {
    mismatch |= (actualBytes[index] ?? 0) ^ (expectedBytes[index] ?? 0);
  }

  return mismatch === 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function resolveBackendRuntimeIdempotencyRepository(): IdempotencyRepository {
  if (backendRuntimeIdempotencyRepository) {
    return backendRuntimeIdempotencyRepository;
  }

  try {
    backendRuntimeIdempotencyRepository = createSupabaseIdempotencyRepository(supabaseAdmin());
    return backendRuntimeIdempotencyRepository;
  } catch (error) {
    if (!(error instanceof MissingSupabaseServiceRoleKeyError)) {
      throw error;
    }

    if (!canUseInProcessIdempotencyFallback()) {
      throw error;
    }

    if (!inProcessLocalDevTestIdempotencyRepository) {
      inProcessLocalDevTestIdempotencyRepository = new InProcessCompatibilityIdempotencyRepository();
    }

    return inProcessLocalDevTestIdempotencyRepository;
  }
}

export function resolveBackendRuntimeTenantVenueRepository(): PlatformTenantVenueRepository {
  if (backendRuntimeTenantVenueRepository) {
    return backendRuntimeTenantVenueRepository;
  }

  backendRuntimeTenantVenueRepository = createSupabaseTenantVenueRepository(supabaseAdmin());
  return backendRuntimeTenantVenueRepository;
}

function resolveTenantVenueContextRepository(
  repository: PlatformTenantVenueContextValidationOptions["repository"],
) {
  return typeof repository === "function"
    ? repository()
    : repository ?? resolveBackendRuntimeTenantVenueRepository();
}

function createHostAuthCompatibilityTenantVenueContext(
  requestContext: ReturnType<typeof platformRequestContextFromRequest>,
  user?: unknown,
): AuthorizedPlatformContext {
  const tenantId = requestContext.tenantId;
  const venueId = requestContext.venueId;
  const tenantIds = extractStringListFromUser(user, [
    ["app_metadata", "reservation_tenant_ids"],
    ["app_metadata", "tenant_ids"],
    ["app_metadata", "reservationPlatform", "tenantIds"],
    ["user_metadata", "reservation_tenant_ids"],
    ["user_metadata", "tenant_ids"],
  ]);
  const venueIds = extractStringListFromUser(user, [
    ["app_metadata", "reservation_venue_ids"],
    ["app_metadata", "venue_ids"],
    ["app_metadata", "reservationPlatform", "venueIds"],
    ["user_metadata", "reservation_venue_ids"],
    ["user_metadata", "venue_ids"],
  ]);

  return {
    principal: {
      subjectId: getUserSubjectId(user) ?? "current-host-authenticated-context",
      tenantIds,
      ...(venueIds.length === 0 ? {} : { venueIds }),
    },
    subjectId: getUserSubjectId(user) ?? "current-host-authenticated-context",
    ...(tenantId === undefined ? {} : { tenantId }),
    ...(venueId === undefined ? {} : { venueId }),
  };
}

function validateHostAuthCompatibilityClaims(context: AuthorizedPlatformContext) {
  const tenantId = context.tenantId;
  const tenantIds = context.principal.tenantIds ?? [];
  if (tenantId !== undefined && !tenantIds.includes(tenantId)) {
    return platformJsonError(
      "forbidden",
      "Authenticated user is not authorized for the requested tenant.",
      403,
      { reason: "tenant_not_authorized" },
    );
  }

  const venueId = context.venueId;
  const venueIds = context.principal.venueIds;
  if (venueId !== undefined && venueIds !== undefined && !venueIds.includes(venueId)) {
    return platformJsonError(
      "forbidden",
      "Authenticated user is not authorized for the requested venue.",
      403,
      { reason: "venue_not_authorized" },
    );
  }

  return null;
}

function getUserSubjectId(user: unknown) {
  if (!isRecord(user)) {
    return null;
  }

  return typeof user.id === "string" ? user.id : null;
}

function extractStringListFromUser(user: unknown, paths: string[][]) {
  if (!isRecord(user)) {
    return [];
  }

  for (const path of paths) {
    const value = readRecordPath(user, path);
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === "string");
    }
  }

  return [];
}

function readRecordPath(record: Record<string, unknown>, path: string[]) {
  let current: unknown = record;
  for (const segment of path) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

export {
  type AuthenticatedSupabase,
  mapLegacyErrorPayload,
  readJsonResponse,
};
