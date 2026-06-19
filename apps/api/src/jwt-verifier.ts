import { webcrypto } from "node:crypto";

import { principalFromTokenClaims, type PlatformTokenClaimMapping } from "@reservation-platform/api";
import type { JsonValue, PlatformErrorResponse } from "@reservation-platform/contract-types";

import type { StandaloneApiBearerTokenVerifier } from "./routes.js";

export interface StandaloneJwtJwksVerifierConfig {
  issuer: string;
  audience: string | readonly string[];
  jwksUrl: string;
  algorithms?: readonly string[];
  claimNames?: PlatformTokenClaimMapping;
  allowMissingTenants?: boolean;
  clockToleranceSeconds?: number;
  jwksCacheTtlSeconds?: number;
  fetch?: typeof fetch;
  now?: () => Date;
}

interface JwtHeader {
  alg?: unknown;
  kid?: unknown;
  typ?: unknown;
}

interface JsonWebKeySet {
  keys?: unknown;
}

type StandaloneJsonWebKey = webcrypto.JsonWebKey;

const defaultAlgorithms = ["RS256"] as const;
const defaultJwksCacheTtlSeconds = 300;
const invalidBearerToken = platformError(401, "unauthorized", "Invalid bearer token.");

export function createStandaloneJwtJwksBearerTokenVerifier(
  config: StandaloneJwtJwksVerifierConfig,
): StandaloneApiBearerTokenVerifier {
  const normalizedConfig = normalizeConfig(config);
  const fetchImpl = config.fetch ?? globalThis.fetch;
  const now = config.now ?? (() => new Date());
  let jwksCache: { keys: StandaloneJsonWebKey[]; expiresAtMs: number } | undefined;

  if (typeof fetchImpl !== "function") {
    throw new StandaloneJwtJwksConfigError(["fetch"]);
  }

  return async ({ token }) => {
    const parsed = parseCompactJwt(token);
    if (!parsed.ok) {
      return invalidBearerToken;
    }

    const { header, payload, signingInput, signature } = parsed;
    if (typeof header.alg !== "string" || !normalizedConfig.algorithms.includes(header.alg)) {
      return invalidBearerToken;
    }

    if (typeof header.kid !== "string" || header.kid.trim().length === 0) {
      return invalidBearerToken;
    }

    const jwk = await readSigningJwk(
      normalizedConfig.jwksUrl,
      header.kid,
      header.alg,
      fetchImpl,
      () => now().getTime(),
      normalizedConfig.jwksCacheTtlSeconds,
      {
        read: () => jwksCache,
        write: (cache) => {
          jwksCache = cache;
        },
      },
    );
    if (!jwk.ok) {
      return invalidBearerToken;
    }

    const signatureValid = await verifySignature(header.alg, jwk.jwk, signingInput, signature);
    if (!signatureValid) {
      return invalidBearerToken;
    }

    if (!validateRegisteredClaims(payload, normalizedConfig, now())) {
      return invalidBearerToken;
    }

    const principal = principalFromTokenClaims(payload, {
      claimNames: normalizedConfig.claimNames,
      allowMissingTenants: normalizedConfig.allowMissingTenants,
    });

    if (!principal.ok) {
      return invalidBearerToken;
    }

    return principal;
  };
}

export class StandaloneJwtJwksConfigError extends Error {
  readonly missingConfigKeys: string[];

  constructor(missingConfigKeys: string[]) {
    super(`Missing standalone JWT/JWKS auth config: ${missingConfigKeys.join(", ")}`);
    this.name = "StandaloneJwtJwksConfigError";
    this.missingConfigKeys = missingConfigKeys;
  }
}

function normalizeConfig(config: StandaloneJwtJwksVerifierConfig) {
  const missingConfigKeys: string[] = [];
  const issuer = config.issuer?.trim() ?? "";
  const jwksUrl = config.jwksUrl?.trim() ?? "";
  const audience = normalizeAudience(config.audience);
  const algorithms = normalizeAlgorithms(config.algorithms ?? defaultAlgorithms);
  const clockToleranceSeconds = config.clockToleranceSeconds ?? 0;
  const jwksCacheTtlSeconds = config.jwksCacheTtlSeconds ?? defaultJwksCacheTtlSeconds;

  if (!issuer) {
    missingConfigKeys.push("issuer");
  }

  if (!jwksUrl) {
    missingConfigKeys.push("jwksUrl");
  }

  if (audience.length === 0) {
    missingConfigKeys.push("audience");
  }

  if (algorithms.length === 0) {
    missingConfigKeys.push("algorithms");
  }

  if (!Number.isFinite(clockToleranceSeconds) || clockToleranceSeconds < 0) {
    missingConfigKeys.push("clockToleranceSeconds");
  }

  if (!Number.isFinite(jwksCacheTtlSeconds) || jwksCacheTtlSeconds < 0) {
    missingConfigKeys.push("jwksCacheTtlSeconds");
  }

  if (missingConfigKeys.length > 0) {
    throw new StandaloneJwtJwksConfigError(missingConfigKeys);
  }

  return {
    issuer,
    jwksUrl,
    audience,
    algorithms,
    claimNames: config.claimNames,
    allowMissingTenants: config.allowMissingTenants,
    clockToleranceSeconds: Math.floor(clockToleranceSeconds),
    jwksCacheTtlSeconds: Math.floor(jwksCacheTtlSeconds),
  };
}

function normalizeAudience(audience: string | readonly string[]) {
  const values = Array.isArray(audience) ? audience : [audience];
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function normalizeAlgorithms(algorithms: readonly string[]) {
  return Array.from(new Set(algorithms.map((value) => value.trim()).filter(Boolean)));
}

function parseCompactJwt(token: string) {
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
    return { ok: false as const };
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = parseJsonPart<JwtHeader>(encodedHeader);
  const payload = parseJsonPart<Record<string, unknown>>(encodedPayload);
  const signature = base64UrlDecode(encodedSignature);

  if (!isRecord(header) || !isRecord(payload) || signature === undefined) {
    return { ok: false as const };
  }

  return {
    ok: true as const,
    header,
    payload,
    signingInput: new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
    signature,
  };
}

function parseJsonPart<T>(encoded: string): T | undefined {
  const bytes = base64UrlDecode(encoded);
  if (bytes === undefined) {
    return undefined;
  }

  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    return undefined;
  }
}

async function readSigningJwk(
  jwksUrl: string,
  kid: string,
  alg: string,
  fetchImpl: typeof fetch,
  nowMs: () => number,
  cacheTtlSeconds: number,
  cache: {
    read(): { keys: StandaloneJsonWebKey[]; expiresAtMs: number } | undefined;
    write(value: { keys: StandaloneJsonWebKey[]; expiresAtMs: number }): void;
  },
) {
  const cached = cache.read();
  const cachedJwk = cached && cached.expiresAtMs > nowMs()
    ? findSigningJwk(cached.keys, kid, alg)
    : undefined;

  if (cachedJwk) {
    return { ok: true as const, jwk: cachedJwk };
  }

  const keys = await fetchSigningJwks(jwksUrl, fetchImpl);
  if (!keys.ok) {
    return { ok: false as const };
  }

  cache.write({
    keys: keys.keys,
    expiresAtMs: nowMs() + cacheTtlSeconds * 1000,
  });

  const jwk = findSigningJwk(keys.keys, kid, alg);
  if (!jwk) {
    return { ok: false as const };
  }

  return { ok: true as const, jwk };
}

async function fetchSigningJwks(
  jwksUrl: string,
  fetchImpl: typeof fetch,
) {
  let response: Response;
  try {
    response = await fetchImpl(jwksUrl, { headers: { Accept: "application/json" } });
  } catch {
    return { ok: false as const };
  }

  if (!response.ok) {
    return { ok: false as const };
  }

  let body: JsonWebKeySet;
  try {
    body = await response.json() as JsonWebKeySet;
  } catch {
    return { ok: false as const };
  }

  const keys = Array.isArray(body.keys) ? body.keys : [];
  return {
    ok: true as const,
    keys: keys.filter(isStandaloneSigningJwk),
  };
}

function findSigningJwk(
  keys: readonly StandaloneJsonWebKey[],
  kid: string,
  alg: string,
) {
  return keys.find((candidate) => (
    isRecord(candidate)
      && candidate.kid === kid
      && candidate.kty === "RSA"
      && (candidate.use === undefined || candidate.use === "sig")
      && (candidate.alg === undefined || candidate.alg === alg)
  ));
}

function isStandaloneSigningJwk(candidate: unknown): candidate is StandaloneJsonWebKey {
  return isRecord(candidate) && candidate.kty === "RSA";
}

async function verifySignature(
  alg: string,
  jwk: StandaloneJsonWebKey,
  signingInput: Uint8Array,
  signature: Uint8Array,
) {
  const algorithm = webCryptoAlgorithm(alg);
  if (algorithm === undefined) {
    return false;
  }

  try {
    const key = await webcrypto.subtle.importKey(
      "jwk",
      jwk,
      algorithm.import,
      false,
      ["verify"],
    );
    return webcrypto.subtle.verify(algorithm.verify, key, signature, signingInput);
  } catch {
    return false;
  }
}

function webCryptoAlgorithm(alg: string) {
  if (alg !== "RS256") {
    return undefined;
  }

  return {
    import: {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    verify: "RSASSA-PKCS1-v1_5",
  } as const;
}

function validateRegisteredClaims(
  claims: Record<string, unknown>,
  config: ReturnType<typeof normalizeConfig>,
  now: Date,
) {
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const tolerance = config.clockToleranceSeconds;

  if (claims.iss !== config.issuer) {
    return false;
  }

  if (!audienceMatches(claims.aud, config.audience)) {
    return false;
  }

  if (!isNumericDate(claims.exp) || nowSeconds > claims.exp + tolerance) {
    return false;
  }

  if (claims.nbf !== undefined && !isNumericDate(claims.nbf)) {
    return false;
  }

  if (typeof claims.nbf === "number" && nowSeconds < claims.nbf - tolerance) {
    return false;
  }

  if (claims.iat !== undefined && !isNumericDate(claims.iat)) {
    return false;
  }

  if (typeof claims.iat === "number" && nowSeconds < claims.iat - tolerance) {
    return false;
  }

  return true;
}

function isNumericDate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function audienceMatches(value: unknown, expected: readonly string[]) {
  const audiences = typeof value === "string"
    ? [value]
    : Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];

  return expected.some((audience) => audiences.includes(audience));
}

function base64UrlDecode(value: string): Uint8Array | undefined {
  if (!/^[A-Za-z0-9_-]*$/u.test(value)) {
    return undefined;
  }

  const normalized = value.replace(/-/gu, "+").replace(/_/gu, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), "=");
  return Uint8Array.from(Buffer.from(padded, "base64"));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function platformError(
  status: number,
  code: PlatformErrorResponse["error"]["code"],
  message: string,
  details?: JsonValue,
) {
  return {
    ok: false as const,
    status,
    body: {
      error: {
        code,
        message,
        status,
        ...(details === undefined ? {} : { details }),
      },
    },
  };
}
