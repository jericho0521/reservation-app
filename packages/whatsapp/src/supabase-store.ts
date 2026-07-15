import type { JsonValue, MetadataRecord } from "@reservation-platform/contract-types";

import { isEncryptedPayload } from "./crypto.js";
import type { WhatsAppContact } from "./messages.js";
import type { WhatsAppEncryptedSessionRecord } from "./session.js";
import type {
  WhatsAppBusinessConfig,
  WhatsAppBusinessConfigPatch,
  WhatsAppConversation,
  WhatsAppConversationAutomationStatus,
  WhatsAppConversationMessage,
  WhatsAppConversationMessageInput,
  WhatsAppKnowledgeEntry,
  WhatsAppKnowledgeInput,
  WhatsAppKnowledgePatch,
  WhatsAppModuleStore,
} from "./storage.js";

export interface SupabaseWhatsAppClient {
  from(table: string): SupabaseQueryBuilder;
}

export interface SupabaseQueryBuilder {
  select(columns?: string): SupabaseQueryBuilder;
  insert(value: unknown): SupabaseQueryBuilder;
  upsert(value: unknown, options?: Record<string, unknown>): SupabaseQueryBuilder;
  update(value: unknown): SupabaseQueryBuilder;
  delete(): SupabaseQueryBuilder;
  eq(column: string, value: unknown): SupabaseQueryBuilder;
  order(column: string, options?: Record<string, unknown>): SupabaseQueryBuilder;
  limit(count: number): SupabaseQueryBuilder;
  single(): Promise<SupabaseResult<unknown>>;
  maybeSingle(): Promise<SupabaseResult<unknown>>;
  then<TResult1 = SupabaseResult<unknown>, TResult2 = never>(
    onfulfilled?: ((value: SupabaseResult<unknown>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2>;
}

export interface SupabaseResult<T> {
  data: T | null;
  error: { message?: string; code?: string; status?: number } | null;
}

export class SupabaseWhatsAppModuleStore implements WhatsAppModuleStore {
  constructor(
    private readonly client: SupabaseWhatsAppClient,
    private readonly options: { requireEncryptedCredentials?: boolean } = {},
  ) {}

  async load() {
    const result = await this.client
      .from("platform_whatsapp_sessions")
      .select("*")
      .limit(1)
      .maybeSingle();
    assertNoError(result);
    if (!result.data) return undefined;
    const record = sessionFromRow(asRecord(result.data));
    assertSessionCredentialStorage(record.encrypted_credentials, this.options.requireEncryptedCredentials === true);
    return record;
  }

  async save(record: WhatsAppEncryptedSessionRecord) {
    assertSessionCredentialStorage(record.encrypted_credentials, this.options.requireEncryptedCredentials === true);
    const result = await this.client
      .from("platform_whatsapp_sessions")
      .upsert(sessionToRow(record), { onConflict: "id" });
    assertNoError(await result);
  }

  async clear() {
    const result = await this.client
      .from("platform_whatsapp_sessions")
      .delete();
    assertNoError(await result);
  }

  async getConfig() {
    const result = await this.client
      .from("platform_whatsapp_config")
      .select("*")
      .eq("id", true)
      .single();
    assertNoError(result);
    return configFromRow(asRecord(result.data));
  }

  async updateConfig(patch: WhatsAppBusinessConfigPatch) {
    const existing = await this.getConfig();
    const result = await this.client
      .from("platform_whatsapp_config")
      .upsert(configPatchToRow({
        ...existing,
        ...patch,
        default_service_id: patch.default_service_id === null ? undefined : patch.default_service_id ?? existing.default_service_id,
        opening_hours: patch.opening_hours === null ? undefined : patch.opening_hours ?? existing.opening_hours,
        metadata: {
          ...(existing.metadata ?? {}),
          ...(patch.metadata ?? {}),
        },
        id: true,
      }), { onConflict: "id" })
      .select("*")
      .single();
    assertNoError(result);
    return configFromRow(asRecord(result.data));
  }

  async listKnowledge() {
    const result = await this.client
      .from("platform_whatsapp_knowledge")
      .select("*")
      .order("updated_at", { ascending: false });
    assertNoError(await result);
    return asArray((await result).data).map((row) => knowledgeFromRow(asRecord(row)));
  }

  async createKnowledge(input: WhatsAppKnowledgeInput) {
    const result = await this.client
      .from("platform_whatsapp_knowledge")
      .insert(knowledgeInputToRow(input))
      .select("*")
      .single();
    assertNoError(result);
    return knowledgeFromRow(asRecord(result.data));
  }

  async updateKnowledge(knowledgeId: string, patch: WhatsAppKnowledgePatch) {
    const result = await this.client
      .from("platform_whatsapp_knowledge")
      .update(knowledgePatchToRow(patch))
      .eq("id", knowledgeId)
      .select("*")
      .maybeSingle();
    assertNoError(result);
    return result.data ? knowledgeFromRow(asRecord(result.data)) : undefined;
  }

  async deleteKnowledge(knowledgeId: string) {
    const result = await this.client
      .from("platform_whatsapp_knowledge")
      .delete()
      .eq("id", knowledgeId)
      .select("id")
      .maybeSingle();
    assertNoError(result);
    return Boolean(result.data);
  }

  async listConversations() {
    const result = await this.client
      .from("platform_whatsapp_conversations")
      .select("*")
      .order("updated_at", { ascending: false });
    assertNoError(await result);
    return asArray((await result).data).map((row) => conversationFromRow(asRecord(row)));
  }

  async getConversation(conversationId: string) {
    const result = await this.client
      .from("platform_whatsapp_conversations")
      .select("*")
      .eq("id", conversationId)
      .maybeSingle();
    assertNoError(result);
    return result.data ? conversationFromRow(asRecord(result.data)) : undefined;
  }

  async getOrCreateConversation(input: {
    provider: "meta_cloud" | "session_qr";
    customer: WhatsAppContact;
    chat_session_id?: string;
    metadata?: MetadataRecord;
  }) {
    const existing = await this.client
      .from("platform_whatsapp_conversations")
      .select("*")
      .eq("provider", input.provider)
      .eq("customer_id", input.customer.id)
      .maybeSingle();
    assertNoError(existing);
    if (existing.data) {
      return conversationFromRow(asRecord(existing.data));
    }

    const created = await this.client
      .from("platform_whatsapp_conversations")
      .insert(conversationInputToRow(input))
      .select("*")
      .single();
    assertNoError(created);
    return conversationFromRow(asRecord(created.data));
  }

  async updateConversationAutomationStatus(input: {
    conversation_id: string;
    automation_status: WhatsAppConversationAutomationStatus;
    changed_by?: string;
  }) {
    const now = new Date().toISOString();
    const result = await this.client
      .from("platform_whatsapp_conversations")
      .update({
        automation_status: input.automation_status,
        automation_paused_at: input.automation_status === "manual" ? now : null,
        automation_paused_by: input.automation_status === "manual" ? input.changed_by ?? "system" : null,
        updated_at: now,
      })
      .eq("id", input.conversation_id)
      .select("*")
      .maybeSingle();
    assertNoError(result);
    return result.data ? conversationFromRow(asRecord(result.data)) : undefined;
  }

  async listConversationMessages(conversationId: string) {
    const result = await this.client
      .from("platform_whatsapp_messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    assertNoError(await result);
    return asArray((await result).data).map((row) => messageFromRow(asRecord(row)));
  }

  async appendConversationMessage(input: WhatsAppConversationMessageInput) {
    const result = await this.client
      .from("platform_whatsapp_messages")
      .insert(messageInputToRow(input))
      .select("*")
      .single();
    assertNoError(result);
    return messageFromRow(asRecord(result.data));
  }
}

export function assertSessionCredentialStorage(payload: string | undefined, encryptionRequired: boolean) {
  if (!encryptionRequired || !payload) return;
  try {
    const parsed = JSON.parse(payload) as unknown;
    if (isEncryptedPayload(parsed)) return;
  } catch {
    // Invalid JSON is not a valid encrypted credential envelope.
  }
  throw new Error("WhatsApp session credentials must be encrypted before persistence.");
}

function sessionToRow(record: WhatsAppEncryptedSessionRecord) {
  return {
    id: record.session_id,
    provider: record.provider,
    status: record.status,
    encrypted_credentials: record.encrypted_credentials,
    qr_code: record.qr_code,
    connected_at: record.connected_at,
    updated_at: record.updated_at,
    metadata: record.metadata ?? {},
  };
}

function sessionFromRow(row: Record<string, unknown>): WhatsAppEncryptedSessionRecord {
  return {
    session_id: String(row.id),
    provider: row.provider === "meta_cloud" ? "meta_cloud" : "session_qr",
    status: parseSessionStatus(row.status),
    encrypted_credentials: stringOrUndefined(row.encrypted_credentials),
    qr_code: stringOrUndefined(row.qr_code),
    connected_at: stringOrUndefined(row.connected_at),
    updated_at: String(row.updated_at),
    metadata: metadataOrUndefined(row.metadata),
  };
}

function configPatchToRow(patch: WhatsAppBusinessConfigPatch & { id: true }) {
  return {
    id: patch.id,
    business_name: patch.business_name,
    default_service_id: patch.default_service_id,
    language: patch.language,
    tone: patch.tone,
    fallback_message: patch.fallback_message,
    booking_confirmation_required: patch.booking_confirmation_required,
    opening_hours: patch.opening_hours,
    metadata: patch.metadata,
    updated_at: new Date().toISOString(),
  };
}

function configFromRow(row: Record<string, unknown>): WhatsAppBusinessConfig {
  return {
    business_name: String(row.business_name),
    default_service_id: stringOrUndefined(row.default_service_id),
    language: String(row.language),
    tone: String(row.tone),
    fallback_message: String(row.fallback_message),
    booking_confirmation_required: row.booking_confirmation_required !== false,
    opening_hours: stringOrUndefined(row.opening_hours),
    metadata: metadataOrUndefined(row.metadata),
    updated_at: String(row.updated_at),
  };
}

function knowledgeInputToRow(input: WhatsAppKnowledgeInput) {
  return {
    title: input.title,
    content: input.content,
    tags: input.tags ?? [],
    active: input.active ?? true,
    metadata: input.metadata ?? {},
  };
}

function knowledgePatchToRow(patch: WhatsAppKnowledgePatch) {
  return {
    title: patch.title,
    content: patch.content,
    tags: patch.tags,
    active: patch.active,
    metadata: patch.metadata,
    updated_at: new Date().toISOString(),
  };
}

function knowledgeFromRow(row: Record<string, unknown>): WhatsAppKnowledgeEntry {
  return {
    knowledge_id: String(row.id),
    title: String(row.title),
    content: String(row.content),
    tags: Array.isArray(row.tags) ? row.tags.filter((tag): tag is string => typeof tag === "string") : [],
    active: row.active !== false,
    metadata: metadataOrUndefined(row.metadata),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function conversationInputToRow(input: {
  provider: "meta_cloud" | "session_qr";
  customer: WhatsAppContact;
  chat_session_id?: string;
  metadata?: MetadataRecord;
}) {
  return {
    provider: input.provider,
    customer_id: input.customer.id,
    customer_phone: input.customer.phoneNumber,
    customer_display_name: input.customer.displayName,
    chat_session_id: input.chat_session_id,
    automation_status: "automated",
    metadata: input.metadata ?? {},
  };
}

function conversationFromRow(row: Record<string, unknown>): WhatsAppConversation {
  return {
    conversation_id: String(row.id),
    provider: row.provider === "meta_cloud" ? "meta_cloud" : "session_qr",
    customer: {
      id: String(row.customer_id),
      phoneNumber: stringOrUndefined(row.customer_phone),
      displayName: stringOrUndefined(row.customer_display_name),
    },
    chat_session_id: stringOrUndefined(row.chat_session_id),
    status: row.status === "closed" ? "closed" : "active",
    automation_status: row.automation_status === "manual" ? "manual" : "automated",
    automation_paused_at: stringOrUndefined(row.automation_paused_at),
    automation_paused_by: stringOrUndefined(row.automation_paused_by),
    metadata: metadataOrUndefined(row.metadata),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function messageInputToRow(input: WhatsAppConversationMessageInput) {
  return {
    conversation_id: input.conversation_id,
    direction: input.direction,
    provider_message_id: input.provider_message_id,
    content: input.content,
    metadata: input.metadata ?? {},
    error: input.error,
  };
}

function messageFromRow(row: Record<string, unknown>): WhatsAppConversationMessage {
  return {
    message_id: String(row.id),
    conversation_id: String(row.conversation_id),
    direction: row.direction === "outbound" ? "outbound" : "inbound",
    provider_message_id: stringOrUndefined(row.provider_message_id),
    content: String(row.content),
    metadata: metadataOrUndefined(row.metadata),
    error: row.error === null ? undefined : row.error as JsonValue,
    created_at: String(row.created_at),
  };
}

function assertNoError(result: SupabaseResult<unknown>) {
  if (result.error) {
    throw new Error(result.error.message ?? "WhatsApp Supabase storage request failed.");
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function metadataOrUndefined(value: unknown): MetadataRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as MetadataRecord : undefined;
}

function parseSessionStatus(value: unknown): WhatsAppEncryptedSessionRecord["status"] {
  return value === "disabled" ||
    value === "pending_qr" ||
    value === "connected" ||
    value === "expired"
    ? value
    : "disconnected";
}
