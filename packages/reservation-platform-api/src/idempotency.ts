import type { JsonValue, PlatformErrorCode, PlatformErrorResponse } from "@reservation-platform/contract-types";
import type { PlatformRequestContext } from "./context.js";

export type IdempotencyRecordStatus = "in_progress" | "completed";

export interface IdempotencyStoredResponse {
  status: number;
  body: unknown;
}

export interface IdempotencyRecord {
  key: string;
  tenantId?: string;
  method: string;
  path: string;
  fingerprint: string;
  status: IdempotencyRecordStatus;
  response?: IdempotencyStoredResponse;
}

export interface IdempotencyCommitRecord {
  key: string;
  tenantId?: string;
  method: string;
  path: string;
  fingerprint: string;
  status: "completed";
  response: IdempotencyStoredResponse;
}

export interface IdempotencyRepository {
  claimInProgress(record: IdempotencyRecord): Promise<IdempotencyRecord | null | undefined> | IdempotencyRecord | null | undefined;
  storeCompleted(record: IdempotencyCommitRecord): Promise<void> | void;
  releaseInProgress(token: IdempotentMutationToken): Promise<void> | void;
}

export interface IdempotentMutationInput {
  key?: string | null;
  tenantId?: string | null;
  method: string;
  path: string;
  fingerprint: string;
}

export interface IdempotentMutationToken {
  key: string;
  tenantId?: string;
  method: string;
  path: string;
  fingerprint: string;
}

export type BeginIdempotentMutationResult =
  | { action: "proceed"; token: IdempotentMutationToken }
  | { action: "replay"; status: number; body: unknown }
  | { action: "reject"; status: number; body: PlatformErrorResponse };

type IdempotencyRejectResult = Extract<BeginIdempotentMutationResult, { action: "reject" }>;

export interface CommitIdempotentMutationResponse {
  status: number;
  body: unknown;
}

export type RequireIdempotencyKeyInput = string | null | undefined | PlatformRequestContext;

export type RequiredIdempotencyKeyResult =
  | { ok: true; key: string }
  | { ok: false; status: number; body: PlatformErrorResponse };

export function requireIdempotencyKey(input: RequireIdempotencyKeyInput): RequiredIdempotencyKeyResult {
  const normalizedKey = normalizeOptional(typeof input === "object" && input !== null ? input.idempotencyKey : input);
  if (normalizedKey !== undefined) {
    return { ok: true, key: normalizedKey };
  }

  const error = idempotencyError(
    400,
    "missing_idempotency_key",
    "Missing Idempotency-Key header for mutation.",
    { status: "rejected" },
  );

  return { ok: false, status: error.status, body: error.body };
}

export async function beginIdempotentMutation(
  repository: IdempotencyRepository,
  input: IdempotentMutationInput,
): Promise<BeginIdempotentMutationResult> {
  const requiredKey = requireIdempotencyKey(input.key);
  if (!requiredKey.ok) {
    return { action: "reject", status: requiredKey.status, body: requiredKey.body };
  }
  const { key } = requiredKey;

  const token = {
    key,
    ...optionalValue("tenantId", normalizeOptional(input.tenantId)),
    method: normalizeMethod(input.method),
    path: input.path,
    fingerprint: input.fingerprint,
  } satisfies IdempotentMutationToken;

  const existing = await repository.claimInProgress({
    ...token,
    status: "in_progress",
  });
  if (existing === null || existing === undefined) {
    return { action: "proceed", token };
  }

  if (!matchesIdempotentMutation(existing, token)) {
    return idempotencyError(
      409,
      "idempotency_key_reused_with_different_request",
      "Idempotency key was already used for a different mutation request.",
      { key, status: "rejected" },
    );
  }

  if (existing.status === "completed" && existing.response !== undefined) {
    return {
      action: "replay",
      status: existing.response.status,
      body: existing.response.body,
    };
  }

  return idempotencyError(
    409,
    "conflict",
    "Idempotent mutation is already in progress for this key.",
    { key, status: "rejected" },
  );
}

export async function commitIdempotentMutation(
  repository: IdempotencyRepository,
  token: IdempotentMutationToken,
  response: CommitIdempotentMutationResponse,
): Promise<void> {
  await repository.storeCompleted({
    ...token,
    status: "completed",
    response,
  });
}

export async function releaseIdempotentMutation(
  repository: IdempotencyRepository,
  token: IdempotentMutationToken,
): Promise<void> {
  await repository.releaseInProgress(token);
}

export function createJsonRequestFingerprint(value: JsonValue): string {
  return canonicalizeJsonValue(value);
}

function matchesIdempotentMutation(
  existing: IdempotencyRecord,
  token: IdempotentMutationToken,
) {
  return normalizeOptional(existing.tenantId) === token.tenantId
    && normalizeMethod(existing.method) === token.method
    && existing.path === token.path
    && existing.fingerprint === token.fingerprint;
}

function canonicalizeJsonValue(value: JsonValue): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonicalizeJsonValue).join(",")}]`;
  }

  const entries = Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalizeJsonValue(entryValue)}`);

  return `{${entries.join(",")}}`;
}

function idempotencyError(
  status: number,
  code: PlatformErrorCode,
  message: string,
  idempotency: NonNullable<PlatformErrorResponse["error"]["idempotency"]>,
): IdempotencyRejectResult {
  return {
    action: "reject",
    status,
    body: {
      error: {
        code,
        message,
        status,
        idempotency,
      },
    },
  };
}

function normalizeOptional(value: string | null | undefined) {
  if (value === null || value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function normalizeMethod(method: string) {
  return method.trim().toUpperCase();
}

function optionalValue<K extends string, V>(key: K, value: V | undefined) {
  return value === undefined ? {} : { [key]: value };
}
