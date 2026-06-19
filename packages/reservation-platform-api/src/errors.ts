import type { PlatformErrorCode } from "@reservation-platform/contract-types";

export function platformErrorBody(
  code: PlatformErrorCode,
  message: string,
  status: number,
  details?: unknown,
) {
  return {
    error: {
      code,
      message,
      status,
      ...(details === undefined ? {} : { details }),
    },
  };
}

export async function readJsonResponse(response: Response) {
  try {
    return await response.json() as unknown;
  } catch {
    return null;
  }
}

export function mapLegacyErrorPayload(payload: unknown, fallbackStatus: number) {
  if (!payload || typeof payload !== "object" || !("error" in payload)) {
    return {
      code: fallbackStatus >= 500 ? "internal_error" : "validation_failed",
      message: "Reservation platform request failed.",
      status: fallbackStatus,
    };
  }

  const record = payload as { error: unknown; details?: unknown };
  const message = typeof record.error === "string" ? record.error : "Reservation platform request failed.";
  const code = fallbackStatus === 401
    ? "unauthorized"
    : fallbackStatus === 403
      ? "forbidden"
      : fallbackStatus === 404
        ? "not_found"
        : fallbackStatus === 409
          ? "conflict"
          : fallbackStatus >= 500
            ? "internal_error"
            : "validation_failed";

  return {
    code,
    message,
    status: fallbackStatus,
    ...(record.details === undefined ? {} : { details: record.details }),
  };
}

export async function platformPayloadFromLegacy(
  response: Response,
  mapSuccess: (payload: unknown) => unknown,
) {
  const payload = await readJsonResponse(response);

  if (!response.ok) {
    return {
      payload: { error: mapLegacyErrorPayload(payload, response.status) },
      status: response.status,
    };
  }

  return {
    payload: mapSuccess(payload),
    status: response.status,
  };
}
