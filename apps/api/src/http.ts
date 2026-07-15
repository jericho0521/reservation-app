import type { PlatformErrorResponse } from "@reservation-platform/contract-types";
import type { AuthenticatedPrincipal } from "@reservation-platform/api";

export interface StandaloneApiRequest {
  method: string;
  path: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
  clientIp?: string;
  internalPreflight?: "auth-only";
  authenticatedPrincipal?: AuthenticatedPrincipal;
}

export interface StandaloneApiResponse {
  status: number;
  headers: Record<string, string | string[]>;
  body: unknown;
}

export function jsonResponse(status: number, body: unknown): StandaloneApiResponse {
  return {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
    body,
  };
}

export function platformError(
  status: number,
  code: PlatformErrorResponse["error"]["code"],
  message: string,
): StandaloneApiResponse {
  return jsonResponse(status, {
    error: {
      code,
      message,
      status,
    },
  });
}
