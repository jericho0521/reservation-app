import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";

import { createStandaloneJwtJwksBearerTokenVerifier } from "./jwt-verifier.js";

const now = new Date("2026-06-13T00:00:00.000Z");
const nowSeconds = Math.floor(now.getTime() / 1000);

test("JWT/JWKS verifier accepts a valid RS256 token and maps platform claims", async () => {
  const fixture = createJwtFixture();
  const verifier = createStandaloneJwtJwksBearerTokenVerifier({
    issuer: "https://issuer.example.com",
    audience: "reservation-api",
    jwksUrl: "https://issuer.example.com/.well-known/jwks.json",
    fetch: fixture.fetch,
    now: () => now,
  });
  const token = fixture.signToken({
    sub: "user_123",
    iss: "https://issuer.example.com",
    aud: "reservation-api",
    exp: nowSeconds + 60,
    iat: nowSeconds - 5,
    tenant_ids: ["tenant_1"],
    venue_ids: "venue_1 venue_2",
    roles: ["admin"],
    scope: "reservations:read reservations:write",
  });

  const result = await verifier({ token, requestContext: {}, request: { method: "GET", path: "/v1/venues" } });

  assert.deepEqual(result, {
    ok: true,
    principal: {
      subjectId: "user_123",
      tenantIds: ["tenant_1"],
      venueIds: ["venue_1", "venue_2"],
      roles: ["admin"],
      scopes: ["reservations:read", "reservations:write"],
    },
  });
});

test("JWT/JWKS verifier caches JWKS keys within the configured TTL", async () => {
  const fixture = createJwtFixture();
  let fetchCalls = 0;
  const verifier = createStandaloneJwtJwksBearerTokenVerifier({
    issuer: "https://issuer.example.com",
    audience: "reservation-api",
    jwksUrl: "https://issuer.example.com/.well-known/jwks.json",
    jwksCacheTtlSeconds: 60,
    fetch: async (...args) => {
      fetchCalls += 1;
      return fixture.fetch(...args);
    },
    now: () => now,
  });
  const token = fixture.signToken({
    sub: "user_123",
    iss: "https://issuer.example.com",
    aud: "reservation-api",
    exp: nowSeconds + 60,
    tenant_ids: ["tenant_1"],
  });

  const firstResult = await verifier({ token, requestContext: {}, request: { method: "GET", path: "/v1/venues" } });
  const secondResult = await verifier({ token, requestContext: {}, request: { method: "GET", path: "/v1/venues" } });

  assert.equal(firstResult.ok, true);
  assert.equal(secondResult.ok, true);
  assert.equal(fetchCalls, 1);
});

test("JWT/JWKS verifier refreshes JWKS once for an unknown kid and accepts a rotated key", async () => {
  const firstFixture = createJwtFixture("first-key");
  const rotatedFixture = createJwtFixture("rotated-key");
  let fetchCalls = 0;
  const verifier = createStandaloneJwtJwksBearerTokenVerifier({
    issuer: "https://issuer.example.com",
    audience: "reservation-api",
    jwksUrl: "https://issuer.example.com/.well-known/jwks.json",
    jwksCacheTtlSeconds: 60,
    fetch: async () => {
      fetchCalls += 1;
      return fetchCalls === 1 ? firstFixture.jwksResponse() : rotatedFixture.jwksResponse();
    },
    now: () => now,
  });
  const firstToken = firstFixture.signToken({
    sub: "user_123",
    iss: "https://issuer.example.com",
    aud: "reservation-api",
    exp: nowSeconds + 60,
    tenant_ids: ["tenant_1"],
  });
  const rotatedToken = rotatedFixture.signToken({
    sub: "user_456",
    iss: "https://issuer.example.com",
    aud: "reservation-api",
    exp: nowSeconds + 60,
    tenant_ids: ["tenant_2"],
  });

  const firstResult = await verifier({ token: firstToken, requestContext: {}, request: { method: "GET", path: "/v1/venues" } });
  const rotatedResult = await verifier({ token: rotatedToken, requestContext: {}, request: { method: "GET", path: "/v1/venues" } });

  assert.equal(firstResult.ok, true);
  assert.deepEqual(rotatedResult, {
    ok: true,
    principal: {
      subjectId: "user_456",
      tenantIds: ["tenant_2"],
      roles: [],
      scopes: [],
    },
  });
  assert.equal(fetchCalls, 2);
});

test("JWT/JWKS verifier supports configurable claim names", async () => {
  const fixture = createJwtFixture();
  const verifier = createStandaloneJwtJwksBearerTokenVerifier({
    issuer: "https://issuer.example.com",
    audience: "reservation-api",
    jwksUrl: "https://issuer.example.com/.well-known/jwks.json",
    claimNames: {
      subject: "uid",
      tenantIds: "tenants",
      roles: "groups",
      scopes: "permissions",
    },
    fetch: fixture.fetch,
    now: () => now,
  });
  const token = fixture.signToken({
    uid: "user_456",
    iss: "https://issuer.example.com",
    aud: ["other-api", "reservation-api"],
    exp: nowSeconds + 60,
    tenants: "tenant_2",
    groups: "operator",
    permissions: ["reservations:read"],
  });

  const result = await verifier({ token, requestContext: {}, request: { method: "GET", path: "/v1/venues" } });

  assert.deepEqual(result, {
    ok: true,
    principal: {
      subjectId: "user_456",
      tenantIds: ["tenant_2"],
      roles: ["operator"],
      scopes: ["reservations:read"],
    },
  });
});

test("JWT/JWKS verifier returns sanitized auth errors for invalid tokens", async () => {
  const fixture = createJwtFixture();
  const verifier = createStandaloneJwtJwksBearerTokenVerifier({
    issuer: "https://issuer.example.com",
    audience: "reservation-api",
    jwksUrl: "https://issuer.example.com/.well-known/jwks.json",
    fetch: fixture.fetch,
    now: () => now,
  });

  const cases = [
    {
      name: "malformed token",
      token: "not-a-jwt",
    },
    {
      name: "unsupported alg",
      token: fixture.signToken({ sub: "user_123", iss: "https://issuer.example.com", aud: "reservation-api", exp: nowSeconds + 60 }, { alg: "HS256" }),
    },
    {
      name: "unknown kid",
      token: fixture.signToken({ sub: "user_123", iss: "https://issuer.example.com", aud: "reservation-api", exp: nowSeconds + 60 }, { kid: "missing-key" }),
    },
    {
      name: "invalid signature",
      token: `${fixture.signToken({ sub: "user_123", iss: "https://issuer.example.com", aud: "reservation-api", exp: nowSeconds + 60 }).slice(0, -1)}x`,
    },
    {
      name: "wrong issuer",
      token: fixture.signToken({ sub: "user_123", iss: "https://wrong.example.com", aud: "reservation-api", exp: nowSeconds + 60 }),
    },
    {
      name: "wrong audience",
      token: fixture.signToken({ sub: "user_123", iss: "https://issuer.example.com", aud: "wrong-api", exp: nowSeconds + 60 }),
    },
    {
      name: "expired",
      token: fixture.signToken({ sub: "user_123", iss: "https://issuer.example.com", aud: "reservation-api", exp: nowSeconds - 1 }),
    },
    {
      name: "not yet valid",
      token: fixture.signToken({ sub: "user_123", iss: "https://issuer.example.com", aud: "reservation-api", exp: nowSeconds + 60, nbf: nowSeconds + 1 }),
    },
    {
      name: "missing principal claims",
      token: fixture.signToken({ iss: "https://issuer.example.com", aud: "reservation-api", exp: nowSeconds + 60 }),
    },
  ];

  for (const testCase of cases) {
    const result = await verifier({
      token: testCase.token,
      requestContext: {},
      request: { method: "GET", path: "/v1/venues" },
    });

    assert.deepEqual(result, sanitizedAuthError(), testCase.name);
  }
});

test("JWT/JWKS verifier rejects non-finite NumericDate claims", async () => {
  const fixture = createJwtFixture();
  const verifier = createStandaloneJwtJwksBearerTokenVerifier({
    issuer: "https://issuer.example.com",
    audience: "reservation-api",
    jwksUrl: "https://issuer.example.com/.well-known/jwks.json",
    fetch: fixture.fetch,
    now: () => now,
  });

  const basePayload = {
    sub: "user_123",
    iss: "https://issuer.example.com",
    aud: "reservation-api",
    exp: nowSeconds + 60,
  };

  const cases = [
    {
      name: "non-finite exp",
      payloadJson: `{"sub":"user_123","iss":"https://issuer.example.com","aud":"reservation-api","exp":1e999}`,
    },
    {
      name: "non-finite nbf",
      payloadJson: JSON.stringify({ ...basePayload, nbf: nowSeconds - 5 }).replace(String(nowSeconds - 5), "1e999"),
    },
    {
      name: "non-finite iat",
      payloadJson: JSON.stringify({ ...basePayload, iat: nowSeconds - 5 }).replace(String(nowSeconds - 5), "1e999"),
    },
  ];

  for (const testCase of cases) {
    const result = await verifier({
      token: fixture.signPayloadJson(testCase.payloadJson),
      requestContext: {},
      request: { method: "GET", path: "/v1/venues" },
    });

    assert.deepEqual(result, sanitizedAuthError(), testCase.name);
  }
});

test("JWT/JWKS verifier fails closed for invalid clock tolerance config", () => {
  assert.throws(
    () => createStandaloneJwtJwksBearerTokenVerifier({
      issuer: "https://issuer.example.com",
      audience: "reservation-api",
      jwksUrl: "https://issuer.example.com/.well-known/jwks.json",
      clockToleranceSeconds: Number.NaN,
      fetch: async () => new Response(JSON.stringify({ keys: [] })),
    }),
    /Missing standalone JWT\/JWKS auth config: clockToleranceSeconds/u,
  );
});

test("JWT/JWKS verifier fails closed for invalid JWKS cache TTL config", () => {
  assert.throws(
    () => createStandaloneJwtJwksBearerTokenVerifier({
      issuer: "https://issuer.example.com",
      audience: "reservation-api",
      jwksUrl: "https://issuer.example.com/.well-known/jwks.json",
      jwksCacheTtlSeconds: Number.POSITIVE_INFINITY,
      fetch: async () => new Response(JSON.stringify({ keys: [] })),
    }),
    /Missing standalone JWT\/JWKS auth config: jwksCacheTtlSeconds/u,
  );
});

function createJwtFixture(kid = "test-key") {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const publicJwk = publicKey.export({ format: "jwk" });
  const jwks = {
    keys: [{
      ...publicJwk,
      kid,
      alg: "RS256",
      use: "sig",
    }],
  };

  return {
    fetch: async (_input?: string | URL | Request, _init?: RequestInit) => jwksResponse(),
    jwksResponse,
    signToken(
      payload: Record<string, unknown>,
      header: Partial<{ alg: string; kid: string; typ: string }> = {},
    ) {
      const encodedHeader = base64UrlJson({
        alg: header.alg ?? "RS256",
        kid: header.kid ?? kid,
        typ: header.typ ?? "JWT",
      });
      const encodedPayload = base64UrlJson(payload);
      const signingInput = `${encodedHeader}.${encodedPayload}`;
      const signature = sign("RSA-SHA256", Buffer.from(signingInput), privateKey);
      return `${signingInput}.${base64Url(signature)}`;
    },
    signPayloadJson(
      payloadJson: string,
      header: Partial<{ alg: string; kid: string; typ: string }> = {},
    ) {
      const encodedHeader = base64UrlJson({
        alg: header.alg ?? "RS256",
        kid: header.kid ?? kid,
        typ: header.typ ?? "JWT",
      });
      const encodedPayload = base64Url(Buffer.from(payloadJson));
      const signingInput = `${encodedHeader}.${encodedPayload}`;
      const signature = sign("RSA-SHA256", Buffer.from(signingInput), privateKey);
      return `${signingInput}.${base64Url(signature)}`;
    },
  };

  function jwksResponse() {
    return new Response(JSON.stringify(jwks), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
}

function base64UrlJson(value: unknown) {
  return base64Url(Buffer.from(JSON.stringify(value)));
}

function base64Url(value: Buffer) {
  return value.toString("base64url");
}

function sanitizedAuthError() {
  return {
    ok: false,
    status: 401,
    body: {
      error: {
        code: "unauthorized",
        message: "Invalid bearer token.",
        status: 401,
      },
    },
  };
}
