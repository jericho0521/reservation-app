import type { PlatformErrorBody } from "@reservation-platform/contract-types";

export interface SDKRetryOptions {
  attempts?: number;
}

export interface SDKRequestInfo {
  method: string;
  url: string;
  headers: Headers;
}

export interface SDKResponseInfo {
  method: string;
  url: string;
  status: number;
  headers: Headers;
}

export interface ReservationPlatformClientOptions {
  baseUrl: string;
  tenantId?: string;
  venueId?: string;
  apiVersion?: "v1" | string;
  getAccessToken?: () => Promise<string | null | undefined> | string | null | undefined;
  credentials?: RequestCredentials;
  headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>);
  fetch?: typeof fetch;
  timeoutMs?: number;
  retry?: SDKRetryOptions | false;
  onRequest?: (request: SDKRequestInfo) => void | Promise<void>;
  onResponse?: (response: SDKResponseInfo) => void | Promise<void>;
}

export interface RequestOptions {
  idempotencyKey?: string;
  correlationId?: string;
  tenantId?: string;
  venueId?: string;
  headers?: HeadersInit;
  signal?: AbortSignal;
  timeoutMs?: number;
  retry?: SDKRetryOptions | false;
}

export class PlatformError extends Error {
  body: PlatformErrorBody;

  constructor(body: PlatformErrorBody) {
    super(body.message);
    this.name = "PlatformError";
    this.body = body;
  }
}

export function isPlatformError(error: unknown): error is PlatformError {
  return error instanceof PlatformError;
}

export function isRetryable(error: unknown): boolean {
  return isPlatformError(error) && error.body.retryable === true;
}

export function createIdempotencyKey(prefix = "reservation-platform") {
  const webCrypto = (globalThis as {
    crypto?: {
      randomUUID?: () => string;
      getRandomValues?: (array: Uint8Array) => Uint8Array;
    };
  }).crypto;

  if (webCrypto?.randomUUID) {
    return `${prefix}-${webCrypto.randomUUID()}`;
  }
  if (webCrypto?.getRandomValues) {
    const bytes = new Uint8Array(16);
    webCrypto.getRandomValues(bytes);
    const random = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${prefix}-${random}`;
  }
  throw new Error("Reservation Platform SDK requires Web Crypto to generate idempotency keys.");
}
