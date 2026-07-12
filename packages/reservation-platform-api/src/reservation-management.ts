import type { ReservationResponse } from "@reservation-platform/contract-types";
import { platformErrorBody } from "./errors.js";
import { toPlatformReservation } from "./platform-adapters.js";

export interface ReservationManagementRepositoryResult {
  data?: unknown;
  error?: unknown;
}

export interface ReservationManagementRepository {
  issue(input: { bookingId: string; tokenHash: string; expiresAt: string }): Promise<ReservationManagementRepositoryResult>;
  read(input: { publicSlug: string; tokenHash: string }): Promise<ReservationManagementRepositoryResult>;
  cancel(input: { publicSlug: string; tokenHash: string }): Promise<ReservationManagementRepositoryResult>;
}

export type ReservationManagementResult = {
  status: number;
  body: ReservationResponse | ReturnType<typeof platformErrorBody>;
};

export async function createReservationManagementToken() {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

export async function hashReservationManagementToken(token: string) {
  const normalized = normalizeManagementToken(token);
  if (!normalized) return undefined;
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function issueReservationManagement(input: {
  repository: ReservationManagementRepository;
  reservation: ReservationResponse;
  token?: string;
  now?: Date;
}) {
  const token = input.token ?? await createReservationManagementToken();
  const tokenHash = await hashReservationManagementToken(token);
  if (!tokenHash) throw new Error("Failed to create reservation management token.");
  const now = input.now ?? new Date();
  const expiresAt = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000).toISOString();
  const result = await input.repository.issue({
    bookingId: input.reservation.reservation_id,
    tokenHash,
    expiresAt,
  });
  if (result.error) throw new Error("Failed to persist reservation management token.");
  return { token, expiresAt };
}

export async function readManagedReservation(input: {
  repository: ReservationManagementRepository;
  publicSlug: string;
  token: string;
}): Promise<ReservationManagementResult> {
  return runManagedReservationOperation(input, "read");
}

export async function cancelManagedReservation(input: {
  repository: ReservationManagementRepository;
  publicSlug: string;
  token: string;
}): Promise<ReservationManagementResult> {
  return runManagedReservationOperation(input, "cancel");
}

async function runManagedReservationOperation(
  input: { repository: ReservationManagementRepository; publicSlug: string; token: string },
  operation: "read" | "cancel",
): Promise<ReservationManagementResult> {
  const publicSlug = input.publicSlug.trim().toLowerCase();
  const tokenHash = await hashReservationManagementToken(input.token);
  if (!publicSlug || !tokenHash) {
    return hiddenTokenFailure();
  }
  try {
    const result = await input.repository[operation]({ publicSlug, tokenHash });
    if (result.error) throw result.error;
    const record = asRecord(result.data);
    if (record.ok !== true) {
      if (record.error_code === "cancellation_closed") {
        return { status: 409, body: platformErrorBody("conflict", "This reservation can no longer be cancelled online.", 409) };
      }
      return hiddenTokenFailure();
    }
    const booking = asRecord(record.booking);
    if (Object.keys(booking).length === 0) return hiddenTokenFailure();
    return { status: 200, body: toPlatformReservation(booking) };
  } catch {
    return { status: 500, body: platformErrorBody("internal_error", "Failed to manage reservation.", 500) };
  }
}

function normalizeManagementToken(token: string) {
  const normalized = token.trim();
  return /^[A-Za-z0-9_-]{43,128}$/.test(normalized) ? normalized : undefined;
}

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function hiddenTokenFailure(): ReservationManagementResult {
  return { status: 404, body: platformErrorBody("not_found", "Reservation management link is invalid or expired.", 404) };
}
