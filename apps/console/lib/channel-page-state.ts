import {
  isPlatformError,
  type WhatsAppChannelReadinessResponse,
  type WhatsAppOwnerSessionResponse,
} from "@reservation-platform/sdk";

export interface ChannelPageState {
  readiness: WhatsAppChannelReadinessResponse;
  session: WhatsAppOwnerSessionResponse;
}

export function canStartWhatsAppSession(status: WhatsAppOwnerSessionResponse["status"]): boolean {
  return status === "disconnected" || status === "expired";
}

export function resolveChannelPageState(
  readinessResult: PromiseSettledResult<WhatsAppChannelReadinessResponse>,
  sessionResult: PromiseSettledResult<WhatsAppOwnerSessionResponse>,
): ChannelPageState {
  const readiness = settledValueOrDisabled(readinessResult, disabledReadiness());
  const session = settledValueOrDisabled(sessionResult, disabledSession());
  return { readiness, session };
}

function settledValueOrDisabled<T>(result: PromiseSettledResult<T>, fallback: T): T {
  if (result.status === "fulfilled") return result.value;
  if (isPlatformError(result.reason) && result.reason.body.code === "whatsapp_module_disabled") return fallback;
  throw result.reason;
}

function disabledReadiness(): WhatsAppChannelReadinessResponse {
  const disabled = {
    configured: false,
    connected: false,
    healthy: false,
    message: "Enable and configure the WhatsApp module to check runtime health.",
  };
  return {
    enabled: false,
    provider: "session_qr",
    simulation_enabled: false,
    production_ready: false,
    missing_requirements: ["whatsapp_enabled"],
    ai: { ...disabled },
    whatsapp: { ...disabled },
  };
}

function disabledSession(): WhatsAppOwnerSessionResponse {
  return {
    provider: "session_qr",
    status: "disabled",
    updated_at: "1970-01-01T00:00:00.000Z",
  };
}
