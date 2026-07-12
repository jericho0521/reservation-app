import { createHash } from "node:crypto";

import type { MetadataRecord } from "@reservation-platform/contract-types";

import type { WhatsAppInboundMessage } from "./messages.js";

export interface WhatsAppSimulationInput {
  text: string;
  from?: string;
  phone?: string;
  displayName?: string;
  messageId?: string;
}

export function createWhatsAppSimulationMessage(
  input: WhatsAppSimulationInput,
  scope: { tenantId?: string; venueId?: string } = {},
): WhatsAppInboundMessage {
  const text = input.text.trim();
  if (!text) throw new Error("Simulation text is required.");
  const from = input.from?.trim() || "demo-customer@s.whatsapp.net";
  const phone = input.phone?.trim() || from.split("@")[0];
  const messageId = input.messageId?.trim() || deterministicMessageId({ ...input, text, from }, scope);
  const raw: MetadataRecord = {
    simulated: true,
    ...(scope.tenantId ? { tenant_id: scope.tenantId } : {}),
    ...(scope.venueId ? { venue_id: scope.venueId } : {}),
  };
  return {
    provider: "session_qr",
    messageId,
    from: { id: from, phoneNumber: phone, ...(input.displayName?.trim() ? { displayName: input.displayName.trim() } : {}) },
    text,
    raw,
  };
}

function deterministicMessageId(input: WhatsAppSimulationInput & { text: string; from: string }, scope: { tenantId?: string; venueId?: string }) {
  const identity = [scope.tenantId ?? "", scope.venueId ?? "", input.from, input.text].join("\n");
  return `sim_${createHash("sha256").update(identity).digest("hex").slice(0, 24)}`;
}
