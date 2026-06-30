import type { MetadataRecord } from "@reservation-platform/contract-types";

export type WhatsAppProviderMode = "meta_cloud" | "session_qr";

export interface WhatsAppContact {
  id: string;
  displayName?: string;
  phoneNumber?: string;
}

export interface WhatsAppInboundMessage {
  provider: WhatsAppProviderMode;
  messageId: string;
  from: WhatsAppContact;
  text?: string;
  timestamp?: string;
  raw?: MetadataRecord;
}

export interface WhatsAppOutboundMessage {
  provider: WhatsAppProviderMode;
  to: string;
  text: string;
  metadata?: MetadataRecord;
}

export interface WhatsAppNormalizedChatMessage {
  customer: WhatsAppContact;
  message: string;
  source: "whatsapp";
  provider: WhatsAppProviderMode;
  providerMessageId: string;
  metadata?: MetadataRecord;
}

export function normalizeWhatsAppInboundTextMessage(
  input: WhatsAppInboundMessage,
): WhatsAppNormalizedChatMessage | null {
  const message = input.text?.trim();
  if (!message) {
    return null;
  }

  return {
    customer: input.from,
    message,
    source: "whatsapp",
    provider: input.provider,
    providerMessageId: input.messageId,
    metadata: input.raw,
  };
}
