import { platformErrorBody } from "./errors.js";

export const platformRequestHeaders = {
  authorization: "Authorization",
  tenantId: "X-Reservation-Tenant-Id",
  venueId: "X-Reservation-Venue-Id",
  correlationId: "X-Correlation-Id",
  idempotencyKey: "Idempotency-Key",
} as const;

export type PlatformRequestHeaderName =
  typeof platformRequestHeaders[keyof typeof platformRequestHeaders];

export interface HeaderGetter {
  get(name: string): string | null | undefined;
}

export type HeaderRecord = Record<string, string | readonly string[] | null | undefined>;

export type PlatformHeadersLike = HeaderGetter | HeaderRecord;

export interface PlatformRequestContext {
  authorizationHeader?: string;
  bearerToken?: string;
  tenantId?: string;
  venueId?: string;
  correlationId?: string;
  idempotencyKey?: string;
}

export type PlatformBearerTokenResult =
  | { ok: true; token: string }
  | { ok: false; error: ReturnType<typeof platformErrorBody>["error"] };

export function readPlatformRequestContext(headersLike: PlatformHeadersLike): PlatformRequestContext {
  const authorizationHeader = readHeader(headersLike, platformRequestHeaders.authorization);
  const bearerToken = parseBearerToken(authorizationHeader);

  return {
    ...(authorizationHeader === undefined ? {} : { authorizationHeader }),
    ...(bearerToken === undefined ? {} : { bearerToken }),
    ...optionalContextValue("tenantId", readHeader(headersLike, platformRequestHeaders.tenantId)),
    ...optionalContextValue("venueId", readHeader(headersLike, platformRequestHeaders.venueId)),
    ...optionalContextValue("correlationId", readHeader(headersLike, platformRequestHeaders.correlationId)),
    ...optionalContextValue("idempotencyKey", readHeader(headersLike, platformRequestHeaders.idempotencyKey)),
  };
}

export function requirePlatformBearerToken(context: PlatformRequestContext): PlatformBearerTokenResult {
  if (context.bearerToken !== undefined) {
    return { ok: true, token: context.bearerToken };
  }

  if (context.authorizationHeader !== undefined) {
    return {
      ok: false,
      error: platformErrorBody(
        "unauthorized",
        "Authorization header must use Bearer authentication.",
        401,
      ).error,
    };
  }

  return {
    ok: false,
    error: platformErrorBody("unauthorized", "Missing bearer token.", 401).error,
  };
}

function readHeader(headersLike: PlatformHeadersLike, name: PlatformRequestHeaderName): string | undefined {
  const rawValue = isHeaderGetter(headersLike)
    ? headersLike.get(name)
    : readRecordHeader(headersLike, name);

  return normalizeHeaderValue(rawValue);
}

function isHeaderGetter(headersLike: PlatformHeadersLike): headersLike is HeaderGetter {
  return typeof (headersLike as HeaderGetter).get === "function";
}

function readRecordHeader(headers: HeaderRecord, name: PlatformRequestHeaderName) {
  const directValue = headers[name];
  if (directValue !== undefined) {
    return directValue;
  }

  const lowercaseName = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lowercaseName) {
      return value;
    }
  }

  return undefined;
}

function normalizeHeaderValue(value: string | readonly string[] | null | undefined) {
  const normalized: string | null | undefined = isReadonlyStringArray(value)
    ? value.join(", ")
    : value;
  if (normalized === null || normalized === undefined) {
    return undefined;
  }

  const trimmed = normalized.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function isReadonlyStringArray(value: string | readonly string[] | null | undefined): value is readonly string[] {
  return Array.isArray(value);
}

function parseBearerToken(authorizationHeader: string | undefined) {
  if (authorizationHeader === undefined) {
    return undefined;
  }

  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader);
  const token = match?.[1]?.trim();
  return token && token.length > 0 ? token : undefined;
}

function optionalContextValue<K extends keyof PlatformRequestContext>(
  key: K,
  value: PlatformRequestContext[K],
) {
  return value === undefined ? {} : { [key]: value };
}
