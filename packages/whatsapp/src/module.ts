import type { MetadataRecord } from "@reservation-platform/contract-types";

import type { WhatsAppNormalizedChatMessage, WhatsAppOutboundMessage } from "./messages.js";
import { normalizeWhatsAppInboundTextMessage, type WhatsAppInboundMessage } from "./messages.js";
import type { WhatsAppSessionAdapter, WhatsAppSessionSnapshot, WhatsAppSessionStartInput } from "./session.js";
import { WhatsAppSessionService } from "./session.js";
import {
  InMemoryWhatsAppModuleStore,
  type WhatsAppBusinessConfigPatch,
  type WhatsAppConversationMessage,
  type WhatsAppKnowledgeInput,
  type WhatsAppKnowledgePatch,
  type WhatsAppModuleStore,
} from "./storage.js";

export interface WhatsAppAgentResponderInput {
  message: WhatsAppNormalizedChatMessage;
  knowledge: Array<{ title: string; content: string; tags: string[] }>;
  config: Awaited<ReturnType<WhatsAppModuleStore["getConfig"]>>;
  conversation_id: string;
  messages: WhatsAppConversationMessage[];
}

export interface WhatsAppAgentResponderOutput {
  content: string;
  metadata?: MetadataRecord;
}

export type WhatsAppAgentResponder = (
  input: WhatsAppAgentResponderInput,
) => Promise<WhatsAppAgentResponderOutput> | WhatsAppAgentResponderOutput;

export interface WhatsAppOutboundSender {
  sendMessage(input: WhatsAppOutboundMessage): Promise<void>;
}

export interface WhatsAppBusinessModuleOptions {
  enabled?: boolean;
  store?: WhatsAppModuleStore;
  sessionAdapter?: WhatsAppSessionAdapter & Partial<WhatsAppOutboundSender>;
  responder?: WhatsAppAgentResponder;
  now?: () => Date;
}

export class WhatsAppBusinessModule {
  private readonly store: WhatsAppModuleStore;
  private readonly sessionService: WhatsAppSessionService;
  private readonly sender?: WhatsAppOutboundSender;
  private readonly responder: WhatsAppAgentResponder;

  constructor(options: WhatsAppBusinessModuleOptions = {}) {
    this.store = options.store ?? new InMemoryWhatsAppModuleStore({ now: options.now });
    this.sessionService = new WhatsAppSessionService({
      enabled: options.enabled,
      store: this.store,
      adapter: options.sessionAdapter,
      now: options.now,
    });
    this.sender = isOutboundSender(options.sessionAdapter) ? options.sessionAdapter : undefined;
    this.responder = options.responder ?? defaultResponder;
  }

  startSession(input: WhatsAppSessionStartInput): Promise<WhatsAppSessionSnapshot> {
    return this.sessionService.start(input);
  }

  sessionStatus(): Promise<WhatsAppSessionSnapshot> {
    return this.sessionService.status();
  }

  sessionQr(): Promise<WhatsAppSessionSnapshot> {
    return this.sessionService.qr();
  }

  logoutSession(): Promise<WhatsAppSessionSnapshot> {
    return this.sessionService.logout();
  }

  getConfig() {
    return this.store.getConfig();
  }

  updateConfig(patch: WhatsAppBusinessConfigPatch) {
    return this.store.updateConfig(patch);
  }

  listKnowledge() {
    return this.store.listKnowledge();
  }

  createKnowledge(input: WhatsAppKnowledgeInput) {
    return this.store.createKnowledge(input);
  }

  updateKnowledge(knowledgeId: string, patch: WhatsAppKnowledgePatch) {
    return this.store.updateKnowledge(knowledgeId, patch);
  }

  deleteKnowledge(knowledgeId: string) {
    return this.store.deleteKnowledge(knowledgeId);
  }

  listConversations() {
    return this.store.listConversations();
  }

  listConversationMessages(conversationId: string): Promise<WhatsAppConversationMessage[]> {
    return this.store.listConversationMessages(conversationId);
  }

  async handleInboundMessage(input: WhatsAppInboundMessage) {
    const normalized = normalizeWhatsAppInboundTextMessage(input);
    if (!normalized) {
      return this.handleUnsupportedInbound(input);
    }

    const conversation = await this.store.getOrCreateConversation({
      provider: input.provider,
      customer: input.from,
      metadata: input.raw,
    });
    await this.store.appendConversationMessage({
      conversation_id: conversation.conversation_id,
      direction: "inbound",
      provider_message_id: input.messageId,
      content: normalized.message,
      metadata: normalized.metadata,
    });

    const config = await this.store.getConfig();
    const messages = await this.store.listConversationMessages(conversation.conversation_id);
    const knowledge = (await this.store.listKnowledge())
      .filter((entry) => entry.active)
      .map((entry) => ({
        title: entry.title,
        content: entry.content,
        tags: entry.tags,
      }));
    const response = await this.responder({
      message: normalized,
      knowledge,
      config,
      conversation_id: conversation.conversation_id,
      messages,
    });

    await this.store.appendConversationMessage({
      conversation_id: conversation.conversation_id,
      direction: "outbound",
      content: response.content,
      metadata: response.metadata,
    });
    await this.sender?.sendMessage({
      provider: input.provider,
      to: input.from.id,
      text: response.content,
      metadata: response.metadata,
    });

    return response;
  }

  private async handleUnsupportedInbound(input: WhatsAppInboundMessage) {
    const conversation = await this.store.getOrCreateConversation({
      provider: input.provider,
      customer: input.from,
      metadata: input.raw,
    });
    const config = await this.store.getConfig();
    await this.store.appendConversationMessage({
      conversation_id: conversation.conversation_id,
      direction: "inbound",
      provider_message_id: input.messageId,
      content: "",
      metadata: {
        unsupported: true,
      },
    });
    await this.store.appendConversationMessage({
      conversation_id: conversation.conversation_id,
      direction: "outbound",
      content: config.fallback_message,
    });
    await this.sender?.sendMessage({
      provider: input.provider,
      to: input.from.id,
      text: config.fallback_message,
    });
    return { content: config.fallback_message };
  }
}

export function createWhatsAppBusinessModuleFromEnv(
  env: Record<string, string | undefined> = process.env,
  options: Omit<WhatsAppBusinessModuleOptions, "enabled"> = {},
) {
  return new WhatsAppBusinessModule({
    ...options,
    enabled: parseEnabled(env.RESERVATION_WHATSAPP_ENABLED),
  });
}

function defaultResponder(input: WhatsAppAgentResponderInput): WhatsAppAgentResponderOutput {
  const matchingKnowledge = input.knowledge.find((entry) =>
    input.message.message.toLowerCase().includes(entry.title.toLowerCase()),
  );
  const prefix = `${input.config.business_name}:`;
  if (matchingKnowledge) {
    return {
      content: `${prefix} ${matchingKnowledge.content}`,
      metadata: { responder: "default-knowledge" },
    };
  }

  return {
    content: `${prefix} ${input.config.fallback_message}`,
    metadata: { responder: "default-fallback" },
  };
}

function isOutboundSender(value: unknown): value is WhatsAppOutboundSender {
  return Boolean(
    value &&
      typeof value === "object" &&
      "sendMessage" in value &&
      typeof (value as { sendMessage?: unknown }).sendMessage === "function",
  );
}

function parseEnabled(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}
