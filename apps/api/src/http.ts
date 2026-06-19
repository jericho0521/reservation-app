import type { PlatformErrorResponse } from "@reservation-platform/contract-types";

export interface StandaloneApiRequest {
  method: string;
  path: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
  internalPreflight?: "auth-only";
}

export interface StandaloneApiResponse {
  status: number;
  headers: Record<string, string>;
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
