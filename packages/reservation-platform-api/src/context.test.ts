import assert from "node:assert/strict";
import test from "node:test";
import {
  platformRequestHeaders,
  readPlatformRequestContext,
  requirePlatformBearerToken,
} from "./context.js";

test("request context reads all platform headers", () => {
  const context = readPlatformRequestContext(new Headers({
    [platformRequestHeaders.authorization]: "Bearer token_123",
    [platformRequestHeaders.tenantId]: "tenant_123",
    [platformRequestHeaders.venueId]: "venue_123",
    [platformRequestHeaders.correlationId]: "corr_123",
    [platformRequestHeaders.idempotencyKey]: "idem_123",
  }));

  assert.deepEqual(context, {
    authorizationHeader: "Bearer token_123",
    bearerToken: "token_123",
    tenantId: "tenant_123",
    venueId: "venue_123",
    correlationId: "corr_123",
    idempotencyKey: "idem_123",
  });
});

test("request context parses lowercase bearer scheme", () => {
  const context = readPlatformRequestContext(new Headers({
    [platformRequestHeaders.authorization]: "bearer token_abc",
  }));

  assert.deepEqual(context, {
    authorizationHeader: "bearer token_abc",
    bearerToken: "token_abc",
  });
});

test("request context trims extra whitespace around headers and bearer token", () => {
  const context = readPlatformRequestContext({
    [platformRequestHeaders.authorization]: "  Bearer    token_trimmed   ",
    [platformRequestHeaders.tenantId]: "  tenant_trimmed  ",
    [platformRequestHeaders.venueId]: " venue_trimmed ",
    [platformRequestHeaders.correlationId]: " corr_trimmed ",
    [platformRequestHeaders.idempotencyKey]: " idem_trimmed ",
  });

  assert.deepEqual(context, {
    authorizationHeader: "Bearer    token_trimmed",
    bearerToken: "token_trimmed",
    tenantId: "tenant_trimmed",
    venueId: "venue_trimmed",
    correlationId: "corr_trimmed",
    idempotencyKey: "idem_trimmed",
  });
});

test("request context preserves non-bearer authorization without token", () => {
  const context = readPlatformRequestContext(new Headers({
    [platformRequestHeaders.authorization]: "Basic abc123",
  }));

  assert.deepEqual(context, {
    authorizationHeader: "Basic abc123",
  });

  assert.deepEqual(requirePlatformBearerToken(context), {
    ok: false,
    error: {
      code: "unauthorized",
      message: "Authorization header must use Bearer authentication.",
      status: 401,
    },
  });
});

test("request context treats missing and empty headers as undefined", () => {
  const context = readPlatformRequestContext({
    [platformRequestHeaders.authorization]: "   ",
    [platformRequestHeaders.tenantId]: "",
    [platformRequestHeaders.venueId]: null,
  });

  assert.deepEqual(context, {});
  assert.deepEqual(requirePlatformBearerToken(context), {
    ok: false,
    error: {
      code: "unauthorized",
      message: "Missing bearer token.",
      status: 401,
    },
  });
});

test("request context reads plain records case-insensitively", () => {
  const context = readPlatformRequestContext({
    authorization: "Bearer token_lower",
    "x-reservation-tenant-id": "tenant_lower",
    "x-reservation-venue-id": "venue_lower",
    "x-correlation-id": "corr_lower",
    "idempotency-key": "idem_lower",
  });

  assert.deepEqual(context, {
    authorizationHeader: "Bearer token_lower",
    bearerToken: "token_lower",
    tenantId: "tenant_lower",
    venueId: "venue_lower",
    correlationId: "corr_lower",
    idempotencyKey: "idem_lower",
  });

  assert.deepEqual(requirePlatformBearerToken(context), {
    ok: true,
    token: "token_lower",
  });
});
