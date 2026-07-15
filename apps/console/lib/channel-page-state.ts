import {
  isPlatformError,
  type WhatsAppChannelReadinessResponse,
  type WhatsAppOwnerSessionResponse,
} from "@reservation-platform/sdk";

export interface ChannelPageState {
  readiness: WhatsAppChannelReadinessResponse;
  session: WhatsAppOwnerSessionResponse;
}

export type WhatsAppSessionDisplayState = "disabled" | "disconnected" | "pairing" | "qr" | "connected" | "reconnecting" | "degraded" | "expired";

export interface WhatsAppSessionPresentation {
  state: WhatsAppSessionDisplayState;
  title: string;
  description: string;
  tone: "ready" | "working" | "attention" | "offline";
  canStart: boolean;
  canDisconnect: boolean;
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

export function describeWhatsAppSession(
  readiness: WhatsAppChannelReadinessResponse,
  session: WhatsAppOwnerSessionResponse,
  qrAvailable: boolean,
): WhatsAppSessionPresentation {
  if (!readiness.enabled || session.status === "disabled") {
    return presentation("disabled", "WhatsApp is disabled", "Enable WhatsApp in channel settings before pairing a device.", "offline", false, false);
  }
  if (session.status === "expired") {
    return presentation("expired", "Pairing expired", "The linked WhatsApp session is no longer valid. Start pairing again to reconnect.", "attention", true, false);
  }
  if (session.status === "pending_qr") {
    return qrAvailable
      ? presentation("qr", "QR code ready", "Open Linked devices in WhatsApp and scan the private pairing code below.", "working", false, true)
      : presentation("pairing", "Preparing a pairing code", "The session is waiting for a fresh QR payload. This page refreshes automatically.", "working", false, true);
  }
  if (isReconnecting(session)) {
    return presentation("reconnecting", "Reconnecting to WhatsApp", "The linked device is temporarily unavailable and the runtime is attempting to reconnect.", "working", false, true);
  }
  if (session.status === "disconnected") {
    return presentation("disconnected", "No device connected", "Start QR pairing to connect this installation to a WhatsApp account.", "offline", true, false);
  }
  if (!readiness.whatsapp.connected || !readiness.whatsapp.healthy) {
    return presentation("degraded", "WhatsApp needs attention", readiness.whatsapp.message || "The linked session is connected but runtime health is degraded.", "attention", false, true);
  }
  return presentation("connected", "WhatsApp is connected", "Customer messages can enter the unified inbox and outbound delivery is active.", "ready", false, true);
}

function presentation(
  state: WhatsAppSessionDisplayState,
  title: string,
  description: string,
  tone: WhatsAppSessionPresentation["tone"],
  canStart: boolean,
  canDisconnect: boolean,
): WhatsAppSessionPresentation {
  return { state, title, description, tone, canStart, canDisconnect };
}

function isReconnecting(session: WhatsAppOwnerSessionResponse) {
  return session.metadata?.connection_state === "reconnecting" || session.metadata?.reconnecting === true;
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
