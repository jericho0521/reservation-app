import type {
  ConversationAppendInput,
  ConversationCreateInput,
  ConversationRepository,
  ExperienceScope,
} from "@reservation-platform/api";
import type {
  ConversationAutomationInput,
  ConversationMessageResponse,
  ConversationResponse,
} from "@reservation-platform/contract-types";

type QueryResult = { data: unknown; error: unknown | null };
interface ConversationQueryBuilder extends PromiseLike<QueryResult> {
  select(columns?: string): ConversationQueryBuilder;
  eq(column: string, value: unknown): ConversationQueryBuilder;
  lt(column: string, value: unknown): ConversationQueryBuilder;
  order(column: string, options?: Record<string, unknown>): ConversationQueryBuilder;
  limit(count: number): ConversationQueryBuilder;
  upsert(value: unknown, options?: Record<string, unknown>): ConversationQueryBuilder;
  update(value: unknown): ConversationQueryBuilder;
  single(): Promise<QueryResult>;
  maybeSingle(): Promise<QueryResult>;
}
export interface ConversationSupabaseClient {
  from(table: string): ConversationQueryBuilder;
  rpc(name: string, params?: Record<string, unknown>): Promise<QueryResult>;
}

const conversationsTable = "platform_conversations";
const participantsTable = "platform_conversation_participants";
const messagesTable = "platform_conversation_messages";
const conversationSelect = "*, platform_conversation_participants(*)";

export function createSupabaseConversationRepository(client: ConversationSupabaseClient): ConversationRepository {
  async function get(scope: ExperienceScope, conversationId: string) {
    const result = await scoped(client.from(conversationsTable).select(conversationSelect), scope)
      .eq("id", conversationId)
      .maybeSingle();
    return adaptOne(result, adaptConversation);
  }

  return {
    async list(scope, input) {
      let query = scoped(client.from(conversationsTable).select(conversationSelect), scope);
      if (input.channel) query = query.eq("channel", input.channel);
      if (input.status) query = query.eq("status", input.status);
      const result = await query.order("last_message_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(input.limit);
      return adaptMany(result, adaptConversation);
    },
    get,
    async getOrCreate(scope, input) {
      const conversation = await client.from(conversationsTable)
        .upsert({
          tenant_id: scope.tenantId,
          venue_id: scope.venueId,
          channel: input.channel,
          channel_thread_id: input.channelThreadId,
        }, { onConflict: "tenant_id,venue_id,channel,channel_thread_id" })
        .select("*")
        .single();
      if (conversation.error || !conversation.data) return { data: undefined, ...(conversation.error ? { error: conversation.error } : {}) };
      const conversationId = String(asRecord(conversation.data).id);
      const participant = await client.from(participantsTable)
        .upsert({
          conversation_id: conversationId,
          role: "customer",
          channel_identifier: input.participant.channelIdentifier ?? null,
          identifier_hash: input.participant.identifierHash ?? null,
          display_name: input.participant.displayName ?? null,
          contact_hint: input.participant.contactHint ?? null,
        }, { onConflict: "conversation_id,role" });
      const participantResult = await participant;
      if (participantResult.error) return { error: participantResult.error };
      return get(scope, conversationId);
    },
    async listMessages(scope, conversationId, input) {
      const conversation = await get(scope, conversationId);
      if (!conversation.data || conversation.error) return { data: [], ...(conversation.error ? { error: conversation.error } : {}) };
      let query = client.from(messagesTable).select("*").eq("conversation_id", conversationId);
      if (input.before) query = query.lt("created_at", input.before);
      const result = await query.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(input.limit);
      return adaptMany(result, adaptMessage);
    },
    async append(scope, conversationId, input) {
      const result = await client.rpc("append_platform_conversation_message", {
        p_tenant_id: scope.tenantId,
        p_venue_id: scope.venueId,
        p_conversation_id: conversationId,
        p_channel: input.channel,
        p_direction: input.direction,
        p_sender_type: input.senderType,
        p_delivery_state: input.deliveryState ?? "sent",
        p_external_message_id: input.externalMessageId ?? null,
        p_content: input.content,
        p_reservation_id: input.reservationId ?? null,
        p_metadata: input.metadata ?? {},
      });
      return adaptOne(result, adaptMessage);
    },
    async appendStaffReplyWithOutbox(scope, conversationId, input) {
      const result = await client.rpc("platform_append_whatsapp_staff_reply", {
        p_tenant_id: scope.tenantId,
        p_venue_id: scope.venueId,
        p_conversation_id: conversationId,
        p_content: input.content,
        p_changed_by: input.changedBy,
      });
      return adaptOne(result, adaptMessage);
    },
    async appendAutomationReplyWithOutbox(scope, conversationId, input) {
      const result = await client.rpc("platform_append_whatsapp_automation_reply", {
        p_tenant_id: scope.tenantId,
        p_venue_id: scope.venueId,
        p_conversation_id: conversationId,
        p_external_message_id: input.externalMessageId ?? null,
        p_content: input.content,
        p_metadata: input.metadata ?? {},
      });
      return adaptOne(result, adaptMessage);
    },
    async updateAutomation(scope, conversationId, input) {
      const result = await scoped(client.from(conversationsTable)
        .update({
          automation_state: input.automation_state,
          automation_changed_at: new Date().toISOString(),
          automation_changed_by: input.changedBy ?? "system",
        }), scope)
        .eq("id", conversationId)
        .select(conversationSelect)
        .maybeSingle();
      return adaptOne(result, adaptConversation);
    },
    async getDeliveryTarget(scope, conversationId) {
      const conversation = await get(scope, conversationId);
      if (!conversation.data || conversation.error) return { data: undefined, ...(conversation.error ? { error: conversation.error } : {}) };
      const result = await client.from(participantsTable)
        .select("channel_identifier")
        .eq("conversation_id", conversationId)
        .eq("role", "customer")
        .maybeSingle();
      const identifier = result.data ? stringValue(asRecord(result.data).channel_identifier) : undefined;
      return { data: identifier ? { channelIdentifier: identifier } : undefined, ...(result.error ? { error: result.error } : {}) };
    },
  };
}

function scoped(query: ConversationQueryBuilder, scope: ExperienceScope) {
  return query.eq("tenant_id", scope.tenantId).eq("venue_id", scope.venueId);
}

function adaptConversation(value: unknown): ConversationResponse {
  const row = asRecord(value);
  const participantRow = asArray(row.platform_conversation_participants)
    .map(asRecord)
    .find((participant) => participant.role === "customer");
  return {
    conversation_id: String(row.id),
    tenant_id: String(row.tenant_id),
    venue_id: String(row.venue_id),
    channel: parseChannel(row.channel),
    status: row.status === "closed" ? "closed" : "active",
    automation_state: row.automation_state === "manual" ? "manual" : "automated",
    ...(participantRow ? { participant: {
      participant_id: String(participantRow.id),
      role: "customer",
      ...(stringValue(participantRow.display_name) ? { display_name: stringValue(participantRow.display_name) } : {}),
      ...(stringValue(participantRow.contact_hint) ? { contact_hint: stringValue(participantRow.contact_hint) } : {}),
    } } : {}),
    ...(stringValue(row.reservation_id) ? { reservation_id: stringValue(row.reservation_id) } : {}),
    ...(stringValue(row.last_message_at) ? { last_message_at: stringValue(row.last_message_at) } : {}),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function adaptMessage(value: unknown): ConversationMessageResponse {
  const row = asRecord(value);
  return {
    message_id: String(row.id),
    conversation_id: String(row.conversation_id),
    channel: parseChannel(row.channel),
    direction: row.direction === "outbound" ? "outbound" : "inbound",
    sender_type: parseSender(row.sender_type),
    delivery_state: parseDelivery(row.delivery_state),
    content: String(row.content),
    ...(stringValue(row.reservation_id) ? { reservation_id: stringValue(row.reservation_id) } : {}),
    created_at: String(row.created_at),
  };
}

function adaptOne<T>(result: QueryResult, adapt: (value: unknown) => T) {
  return { data: result.data ? adapt(result.data) : undefined, ...(result.error ? { error: result.error } : {}) };
}
function adaptMany<T>(result: QueryResult, adapt: (value: unknown) => T) {
  return { data: asArray(result.data).map(adapt), ...(result.error ? { error: result.error } : {}) };
}
function asRecord(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function asArray(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function stringValue(value: unknown) { return typeof value === "string" && value ? value : undefined; }
function parseChannel(value: unknown): "web_chat" | "whatsapp" | "simulation" { return value === "whatsapp" ? "whatsapp" : value === "simulation" ? "simulation" : "web_chat"; }
function parseSender(value: unknown): "customer" | "automation" | "staff" | "system" { return value === "automation" || value === "staff" || value === "system" ? value : "customer"; }
function parseDelivery(value: unknown): "pending" | "sent" | "delivered" | "failed" { return value === "pending" || value === "delivered" || value === "failed" ? value : "sent"; }
