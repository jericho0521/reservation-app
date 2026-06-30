import { randomUUID } from "node:crypto";

import type { JsonValue, MetadataRecord } from "@reservation-platform/contract-types";

import type { WhatsAppContact, WhatsAppProviderMode } from "./messages.js";
import type { WhatsAppEncryptedSessionRecord, WhatsAppSessionStore } from "./session.js";

export interface WhatsAppBusinessConfig {
  business_name: string;
  default_service_id?: string;
  language: string;
  tone: string;
  fallback_message: string;
  booking_confirmation_required: boolean;
  opening_hours?: string;
  metadata?: MetadataRecord;
  updated_at: string;
}

export interface WhatsAppBusinessConfigPatch {
  business_name?: string;
  default_service_id?: string | null;
  language?: string;
  tone?: string;
  fallback_message?: string;
  booking_confirmation_required?: boolean;
  opening_hours?: string | null;
  metadata?: MetadataRecord;
}

export interface WhatsAppKnowledgeEntry {
  knowledge_id: string;
  title: string;
  content: string;
  tags: string[];
  active: boolean;
  metadata?: MetadataRecord;
  created_at: string;
  updated_at: string;
}

export interface WhatsAppKnowledgeInput {
  title: string;
  content: string;
  tags?: string[];
  active?: boolean;
  metadata?: MetadataRecord;
}

export interface WhatsAppKnowledgePatch {
  title?: string;
  content?: string;
  tags?: string[];
  active?: boolean;
  metadata?: MetadataRecord;
}

export type WhatsAppMessageDirection = "inbound" | "outbound";

export interface WhatsAppConversation {
  conversation_id: string;
  provider: WhatsAppProviderMode;
  customer: WhatsAppContact;
  chat_session_id?: string;
  status: "active" | "closed";
  created_at: string;
  updated_at: string;
  metadata?: MetadataRecord;
}

export interface WhatsAppConversationMessage {
  message_id: string;
  conversation_id: string;
  direction: WhatsAppMessageDirection;
  provider_message_id?: string;
  content: string;
  created_at: string;
  metadata?: MetadataRecord;
  error?: JsonValue;
}

export interface WhatsAppConversationMessageInput {
  conversation_id: string;
  direction: WhatsAppMessageDirection;
  provider_message_id?: string;
  content: string;
  metadata?: MetadataRecord;
  error?: JsonValue;
}

export interface WhatsAppModuleStore extends WhatsAppSessionStore {
  getConfig(): Promise<WhatsAppBusinessConfig>;
  updateConfig(patch: WhatsAppBusinessConfigPatch): Promise<WhatsAppBusinessConfig>;
  listKnowledge(): Promise<WhatsAppKnowledgeEntry[]>;
  createKnowledge(input: WhatsAppKnowledgeInput): Promise<WhatsAppKnowledgeEntry>;
  updateKnowledge(knowledgeId: string, patch: WhatsAppKnowledgePatch): Promise<WhatsAppKnowledgeEntry | undefined>;
  deleteKnowledge(knowledgeId: string): Promise<boolean>;
  listConversations(): Promise<WhatsAppConversation[]>;
  getOrCreateConversation(input: {
    provider: WhatsAppProviderMode;
    customer: WhatsAppContact;
    chat_session_id?: string;
    metadata?: MetadataRecord;
  }): Promise<WhatsAppConversation>;
  listConversationMessages(conversationId: string): Promise<WhatsAppConversationMessage[]>;
  appendConversationMessage(input: WhatsAppConversationMessageInput): Promise<WhatsAppConversationMessage>;
}

export class InMemoryWhatsAppModuleStore implements WhatsAppModuleStore {
  private session: WhatsAppEncryptedSessionRecord | undefined;
  private config: WhatsAppBusinessConfig;
  private readonly knowledge = new Map<string, WhatsAppKnowledgeEntry>();
  private readonly conversations = new Map<string, WhatsAppConversation>();
  private readonly messages = new Map<string, WhatsAppConversationMessage[]>();
  private readonly now: () => Date;

  constructor(options: { now?: () => Date; config?: Partial<WhatsAppBusinessConfig> } = {}) {
    this.now = options.now ?? (() => new Date());
    this.config = normalizeConfigPatch({
      business_name: "Reservation Business",
      language: "en",
      tone: "friendly_professional",
      fallback_message: "Please wait while staff checks this for you.",
      booking_confirmation_required: true,
      updated_at: this.nowIso(),
      ...options.config,
    });
  }

  async load() {
    return this.session ? clone(this.session) : undefined;
  }

  async save(record: WhatsAppEncryptedSessionRecord) {
    this.session = clone(record);
  }

  async clear() {
    this.session = undefined;
  }

  async getConfig() {
    return clone(this.config);
  }

  async updateConfig(patch: WhatsAppBusinessConfigPatch) {
    this.config = normalizeConfigPatch({
      ...this.config,
      ...normalizeNullableConfigFields(patch),
      updated_at: this.nowIso(),
    });
    return clone(this.config);
  }

  async listKnowledge() {
    return [...this.knowledge.values()].map(clone);
  }

  async createKnowledge(input: WhatsAppKnowledgeInput) {
    const now = this.nowIso();
    const entry: WhatsAppKnowledgeEntry = {
      knowledge_id: randomUUID(),
      title: normalizeRequiredText(input.title, "Knowledge title"),
      content: normalizeRequiredText(input.content, "Knowledge content"),
      tags: normalizeTags(input.tags),
      active: input.active ?? true,
      metadata: input.metadata,
      created_at: now,
      updated_at: now,
    };
    this.knowledge.set(entry.knowledge_id, entry);
    return clone(entry);
  }

  async updateKnowledge(knowledgeId: string, patch: WhatsAppKnowledgePatch) {
    const existing = this.knowledge.get(knowledgeId);
    if (!existing) {
      return undefined;
    }

    const updated: WhatsAppKnowledgeEntry = {
      ...existing,
      ...(patch.title === undefined ? {} : { title: normalizeRequiredText(patch.title, "Knowledge title") }),
      ...(patch.content === undefined ? {} : { content: normalizeRequiredText(patch.content, "Knowledge content") }),
      ...(patch.tags === undefined ? {} : { tags: normalizeTags(patch.tags) }),
      ...(patch.active === undefined ? {} : { active: patch.active }),
      ...(patch.metadata === undefined ? {} : { metadata: patch.metadata }),
      updated_at: this.nowIso(),
    };
    this.knowledge.set(knowledgeId, updated);
    return clone(updated);
  }

  async deleteKnowledge(knowledgeId: string) {
    return this.knowledge.delete(knowledgeId);
  }

  async listConversations() {
    return [...this.conversations.values()].map(clone);
  }

  async getOrCreateConversation(input: {
    provider: WhatsAppProviderMode;
    customer: WhatsAppContact;
    chat_session_id?: string;
    metadata?: MetadataRecord;
  }) {
    const existing = [...this.conversations.values()].find(
      (conversation) => conversation.provider === input.provider && conversation.customer.id === input.customer.id,
    );
    if (existing) {
      return clone(existing);
    }

    const now = this.nowIso();
    const conversation: WhatsAppConversation = {
      conversation_id: randomUUID(),
      provider: input.provider,
      customer: input.customer,
      chat_session_id: input.chat_session_id,
      status: "active",
      created_at: now,
      updated_at: now,
      metadata: input.metadata,
    };
    this.conversations.set(conversation.conversation_id, conversation);
    this.messages.set(conversation.conversation_id, []);
    return clone(conversation);
  }

  async listConversationMessages(conversationId: string) {
    return (this.messages.get(conversationId) ?? []).map(clone);
  }

  async appendConversationMessage(input: WhatsAppConversationMessageInput) {
    const now = this.nowIso();
    const message: WhatsAppConversationMessage = {
      message_id: randomUUID(),
      conversation_id: input.conversation_id,
      direction: input.direction,
      provider_message_id: input.provider_message_id,
      content: input.content,
      metadata: input.metadata,
      error: input.error,
      created_at: now,
    };
    const messages = this.messages.get(input.conversation_id) ?? [];
    messages.push(message);
    this.messages.set(input.conversation_id, messages);

    const conversation = this.conversations.get(input.conversation_id);
    if (conversation) {
      this.conversations.set(input.conversation_id, {
        ...conversation,
        updated_at: now,
      });
    }

    return clone(message);
  }

  private nowIso() {
    return this.now().toISOString();
  }
}

export function normalizeRequiredText(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${label} is required.`);
  }
  return normalized;
}

function normalizeConfigPatch(input: WhatsAppBusinessConfig): WhatsAppBusinessConfig {
  return {
    ...input,
    business_name: normalizeRequiredText(input.business_name, "Business name"),
    language: normalizeRequiredText(input.language, "Language"),
    tone: normalizeRequiredText(input.tone, "Tone"),
    fallback_message: normalizeRequiredText(input.fallback_message, "Fallback message"),
    booking_confirmation_required: input.booking_confirmation_required,
    updated_at: input.updated_at,
  };
}

function normalizeNullableConfigFields(
  patch: WhatsAppBusinessConfigPatch,
): Partial<WhatsAppBusinessConfig> {
  const output: Partial<WhatsAppBusinessConfig> = {};
  if (patch.business_name !== undefined) {
    output.business_name = patch.business_name;
  }
  if (patch.default_service_id !== undefined) {
    output.default_service_id = patch.default_service_id ?? undefined;
  }
  if (patch.language !== undefined) {
    output.language = patch.language;
  }
  if (patch.tone !== undefined) {
    output.tone = patch.tone;
  }
  if (patch.fallback_message !== undefined) {
    output.fallback_message = patch.fallback_message;
  }
  if (patch.booking_confirmation_required !== undefined) {
    output.booking_confirmation_required = patch.booking_confirmation_required;
  }
  if (patch.opening_hours !== undefined) {
    output.opening_hours = patch.opening_hours ?? undefined;
  }
  if (patch.metadata !== undefined) {
    output.metadata = patch.metadata;
  }
  return output;
}

function normalizeTags(tags: string[] | undefined) {
  return [...new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean))];
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
