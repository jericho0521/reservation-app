import type { MetadataRecord } from "@reservation-platform/contract-types";

import type { WhatsAppNormalizedChatMessage, WhatsAppOutboundMessage } from "./messages.js";
import { normalizeWhatsAppInboundTextMessage, type WhatsAppInboundMessage } from "./messages.js";
import type { WhatsAppSessionAdapter, WhatsAppSessionSnapshot, WhatsAppSessionStartInput } from "./session.js";
import { WhatsAppSessionService } from "./session.js";
import {
  InMemoryWhatsAppModuleStore,
  type WhatsAppBusinessConfigPatch,
  type WhatsAppConversation,
  type WhatsAppConversationAutomationStatus,
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
  automationEnabled?: boolean;
  store?: WhatsAppModuleStore;
  sessionAdapter?: WhatsAppSessionAdapter & Partial<WhatsAppOutboundSender>;
  responder?: WhatsAppAgentResponder;
  unifiedConversations?: WhatsAppUnifiedConversationBridge;
  now?: () => Date;
}

export interface WhatsAppUnifiedConversationBridgeResult {
  content: string;
  conversation_id: string;
  automation_suppressed?: boolean;
  metadata?: MetadataRecord;
}

export interface WhatsAppUnifiedConversationBridge {
  handleInbound(input: WhatsAppInboundMessage): Promise<WhatsAppUnifiedConversationBridgeResult>;
}

export class WhatsAppBusinessModule {
  private readonly store: WhatsAppModuleStore;
  private readonly sessionService: WhatsAppSessionService;
  private readonly sender?: WhatsAppOutboundSender;
  private readonly responder: WhatsAppAgentResponder;
  private readonly automationEnabled: boolean;
  private readonly unifiedConversations?: WhatsAppUnifiedConversationBridge;

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
    this.automationEnabled = options.automationEnabled ?? true;
    this.unifiedConversations = options.unifiedConversations;
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

  restoreSessionConnection(): Promise<WhatsAppSessionSnapshot> {
    return this.sessionService.restoreConnection();
  }

  async sendDirectMessage(input: { to: string; text: string; metadata?: MetadataRecord }) {
    if (!this.sender) throw new Error("WhatsApp session is not connected.");
    const text = input.text.trim();
    if (!text) throw new Error("Message text is required.");
    await this.sender.sendMessage({ provider: "session_qr", to: input.to, text, metadata: input.metadata });
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

  async updateConversationAutomationStatus(input: {
    conversation_id: string;
    automation_status: WhatsAppConversationAutomationStatus;
    changed_by?: string;
  }) {
    const updated = await this.store.updateConversationAutomationStatus(input);
    if (updated && input.automation_status === "manual") {
      await this.appendAutomationAuditMessage(updated.conversation_id, "automation_takeover", input.changed_by);
    } else if (updated) {
      await this.appendAutomationAuditMessage(updated.conversation_id, "automation_resumed", input.changed_by);
    }
    return updated;
  }

  async sendConversationMessage(input: {
    conversation_id: string;
    text: string;
    changed_by?: string;
  }) {
    const conversation = await this.store.getConversation(input.conversation_id);
    if (!conversation) {
      return undefined;
    }
    const text = input.text.trim();
    if (!text) {
      throw new Error("Message text is required.");
    }
    if (!this.sender) {
      throw new Error("WhatsApp session is not connected.");
    }
    await this.sendOutboundMessage(conversation, text, { staff_reply: true });
    const message = await this.store.appendConversationMessage({
      conversation_id: conversation.conversation_id,
      direction: "outbound",
      content: text,
      metadata: { staff_reply: true },
    });
    await this.store.updateConversationAutomationStatus({
      conversation_id: conversation.conversation_id,
      automation_status: "manual",
      changed_by: input.changed_by,
    });
    await this.appendAutomationAuditMessage(conversation.conversation_id, "automation_takeover", input.changed_by);
    return message;
  }

  async handleInboundMessage(input: WhatsAppInboundMessage) {
    if (this.unifiedConversations) {
      const response = await this.unifiedConversations.handleInbound(input);
      if (response.content && !response.automation_suppressed) {
        await this.sender?.sendMessage({ provider: input.provider, to: input.from.id, text: response.content, metadata: response.metadata });
      }
      return response;
    }
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
    if (!this.automationEnabled || conversation.automation_status === "manual") {
      return {
        content: "",
        metadata: {
          responder: "manual_handoff",
          automation_status: conversation.automation_status,
        },
      };
    }

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
    await this.sendOutboundMessage(conversation, response.content, response.metadata);

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
    if (!this.automationEnabled || conversation.automation_status === "manual") {
      return {
        content: "",
        metadata: {
          responder: "manual_handoff",
          automation_status: conversation.automation_status,
          unsupported: true,
        },
      };
    }
    await this.store.appendConversationMessage({
      conversation_id: conversation.conversation_id,
      direction: "outbound",
      content: config.fallback_message,
    });
    await this.sendOutboundMessage(conversation, config.fallback_message);
    return { content: config.fallback_message };
  }

  private async sendOutboundMessage(
    conversation: WhatsAppConversation,
    text: string,
    metadata?: MetadataRecord,
  ) {
    await this.sender?.sendMessage({
      provider: conversation.provider,
      to: conversation.customer.id,
      text,
      metadata,
    });
  }

  private async appendAutomationAuditMessage(
    conversationId: string,
    event: "automation_takeover" | "automation_resumed",
    changedBy: string | undefined,
  ) {
    await this.store.appendConversationMessage({
      conversation_id: conversationId,
      direction: "outbound",
      content: "",
      metadata: {
        system_event: event,
        ...(event === "automation_takeover" ? { draft_status: "failed", reason: "staff_takeover" } : {}),
        changed_by: changedBy ?? "system",
      },
    });
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
