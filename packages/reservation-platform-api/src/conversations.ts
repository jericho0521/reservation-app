import {
  conversationAutomationInputSchema,
  conversationStaffReplyInputSchema,
  listConversationMessagesQuerySchema,
  listConversationsQuerySchema,
  type ConversationAutomationInput,
  type ConversationChannel,
  type ConversationMessageResponse,
  type ConversationResponse,
  type ListConversationMessagesQuery,
  type ListConversationMessagesResponse,
  type ListConversationsQuery,
  type ListConversationsResponse,
} from "@reservation-platform/contract-types";
import { platformErrorBody } from "./errors.js";
import type { ExperienceScope } from "./experience-studio.js";

export interface ConversationCreateInput {
  channel: ConversationChannel;
  channelThreadId: string;
  participant: {
    channelIdentifier?: string;
    identifierHash?: string;
    displayName?: string;
    contactHint?: string;
  };
}

export interface ConversationAppendInput {
  channel: ConversationChannel;
  direction: "inbound" | "outbound";
  senderType: "customer" | "automation" | "staff" | "system";
  deliveryState?: "pending" | "sent" | "delivered" | "failed";
  externalMessageId?: string;
  content: string;
  reservationId?: string;
  metadata?: Record<string, unknown>;
}

export interface ConversationRepository {
  list(scope: ExperienceScope, query: Required<Pick<ListConversationsQuery, "limit">> & Omit<ListConversationsQuery, "limit">): Promise<{ data?: ConversationResponse[]; error?: unknown }>;
  get(scope: ExperienceScope, conversationId: string): Promise<{ data?: ConversationResponse; error?: unknown }>;
  getOrCreate(scope: ExperienceScope, input: ConversationCreateInput): Promise<{ data?: ConversationResponse; error?: unknown }>;
  listMessages(scope: ExperienceScope, conversationId: string, query: Required<Pick<ListConversationMessagesQuery, "limit">> & Omit<ListConversationMessagesQuery, "limit">): Promise<{ data?: ConversationMessageResponse[]; error?: unknown }>;
  append(scope: ExperienceScope, conversationId: string, input: ConversationAppendInput): Promise<{ data?: ConversationMessageResponse; error?: unknown }>;
  appendAutomationReplyWithOutbox?(scope: ExperienceScope, conversationId: string, input: ConversationAppendInput): Promise<{ data?: ConversationMessageResponse; error?: unknown }>;
  appendStaffReplyWithOutbox?(scope: ExperienceScope, conversationId: string, input: { content: string; changedBy: string }): Promise<{ data?: ConversationMessageResponse; error?: unknown }>;
  updateAutomation(scope: ExperienceScope, conversationId: string, input: ConversationAutomationInput & { changedBy?: string }): Promise<{ data?: ConversationResponse; error?: unknown }>;
  getDeliveryTarget?(scope: ExperienceScope, conversationId: string): Promise<{ data?: { channelIdentifier: string }; error?: unknown }>;
}

export type ConversationResult<T> = { status: number; body: T | ReturnType<typeof platformErrorBody> };

export async function listConversations(input: {
  scope: ExperienceScope;
  query?: ListConversationsQuery;
  repository: ConversationRepository;
}): Promise<ConversationResult<ListConversationsResponse>> {
  const scope = normalizeScope(input.scope);
  if (!scope) return invalidScope();
  const parsed = listConversationsQuerySchema.safeParse(input.query ?? {});
  if (!parsed.success) return validationFailure("Invalid conversation query.");
  try {
    const result = await input.repository.list(scope, { ...parsed.data, limit: parsed.data.limit ?? 50 });
    if (result.error) throw result.error;
    return { status: 200, body: { conversations: result.data ?? [] } };
  } catch {
    return storageFailure();
  }
}

export async function readConversation(input: {
  scope: ExperienceScope;
  conversationId: string;
  repository: ConversationRepository;
}): Promise<ConversationResult<ConversationResponse>> {
  const scope = normalizeScope(input.scope);
  if (!scope || !input.conversationId.trim()) return validationFailure("Conversation id is required.");
  try {
    const result = await input.repository.get(scope, input.conversationId.trim());
    if (result.error) throw result.error;
    return result.data ? { status: 200, body: result.data } : notFound();
  } catch {
    return storageFailure();
  }
}

export async function getOrCreateConversation(input: {
  scope: ExperienceScope;
  value: ConversationCreateInput;
  repository: ConversationRepository;
}): Promise<ConversationResult<ConversationResponse>> {
  const scope = normalizeScope(input.scope);
  if (!scope || !input.value.channelThreadId.trim()) return validationFailure("Conversation channel thread is required.");
  try {
    const result = await input.repository.getOrCreate(scope, input.value);
    if (result.error) throw result.error;
    return result.data ? { status: 200, body: result.data } : storageFailure();
  } catch {
    return storageFailure();
  }
}

export async function listConversationMessages(input: {
  scope: ExperienceScope;
  conversationId: string;
  query?: ListConversationMessagesQuery;
  repository: ConversationRepository;
}): Promise<ConversationResult<ListConversationMessagesResponse>> {
  const scope = normalizeScope(input.scope);
  if (!scope || !input.conversationId.trim()) return validationFailure("Conversation id is required.");
  const parsed = listConversationMessagesQuerySchema.safeParse(input.query ?? {});
  if (!parsed.success) return validationFailure("Invalid conversation message query.");
  const limit = parsed.data.limit ?? 50;
  try {
    const result = await input.repository.listMessages(scope, input.conversationId.trim(), { ...parsed.data, limit });
    if (result.error) throw result.error;
    const newestFirst = result.data ?? [];
    const messages = [...newestFirst].reverse();
    return {
      status: 200,
      body: {
        messages,
        ...(newestFirst.length === limit && newestFirst.at(-1)?.created_at
          ? { next_cursor: newestFirst.at(-1)!.created_at }
          : {}),
      },
    };
  } catch {
    return storageFailure();
  }
}

export async function appendConversationMessage(input: {
  scope: ExperienceScope;
  conversationId: string;
  value: ConversationAppendInput;
  repository: ConversationRepository;
}): Promise<ConversationResult<ConversationMessageResponse>> {
  const scope = normalizeScope(input.scope);
  const content = input.value.content.trim();
  if (!scope || !input.conversationId.trim() || !content || content.length > 4000) {
    return validationFailure("Conversation message is invalid.");
  }
  try {
    const result = await input.repository.append(scope, input.conversationId.trim(), { ...input.value, content });
    if (result.error) throw result.error;
    return result.data ? { status: 200, body: result.data } : storageFailure();
  } catch {
    return storageFailure();
  }
}

export async function appendStaffReply(input: {
  scope: ExperienceScope;
  conversationId: string;
  value: unknown;
  repository: ConversationRepository;
  deliver?: (input: { conversation: ConversationResponse; content: string }) => Promise<void>;
}): Promise<ConversationResult<ConversationMessageResponse>> {
  const parsed = conversationStaffReplyInputSchema.safeParse(input.value);
  if (!parsed.success) return validationFailure("Staff reply is invalid.");
  const conversation = await readConversation({
    scope: input.scope,
    conversationId: input.conversationId,
    repository: input.repository,
  });
  if (conversation.status !== 200 || !("channel" in conversation.body)) {
    return { status: conversation.status, body: conversation.body as ReturnType<typeof platformErrorBody> };
  }
  if (conversation.body.channel === "whatsapp" && input.repository.appendStaffReplyWithOutbox) {
    try {
      const result = await input.repository.appendStaffReplyWithOutbox(input.scope, input.conversationId, {
        content: parsed.data.content,
        changedBy: "staff",
      });
      if (result.error) throw result.error;
      return result.data ? { status: 200, body: result.data } : storageFailure();
    } catch {
      return storageFailure();
    }
  }
  try {
    const takeover = await input.repository.updateAutomation(input.scope, input.conversationId, { automation_state: "manual", changedBy: "staff" });
    if (takeover.error || !takeover.data) throw takeover.error ?? new Error("takeover failed");
    await input.deliver?.({ conversation: conversation.body, content: parsed.data.content });
  } catch {
    return storageFailure();
  }
  return appendConversationMessage({
    ...input,
    value: { channel: conversation.body.channel, direction: "outbound", senderType: "staff", content: parsed.data.content },
  });
}

export async function updateConversationAutomation(input: {
  scope: ExperienceScope;
  conversationId: string;
  value: unknown;
  changedBy?: string;
  repository: ConversationRepository;
}): Promise<ConversationResult<ConversationResponse>> {
  const scope = normalizeScope(input.scope);
  const parsed = conversationAutomationInputSchema.safeParse(input.value);
  if (!scope || !input.conversationId.trim() || !parsed.success) return validationFailure("Conversation automation update is invalid.");
  try {
    const result = await input.repository.updateAutomation(scope, input.conversationId.trim(), { ...parsed.data, changedBy: input.changedBy });
    if (result.error) throw result.error;
    return result.data ? { status: 200, body: result.data } : notFound();
  } catch {
    return storageFailure();
  }
}

function normalizeScope(scope: ExperienceScope) {
  const tenantId = scope.tenantId.trim();
  const venueId = scope.venueId.trim();
  return tenantId && venueId ? { tenantId, venueId } : undefined;
}
function invalidScope(): ConversationResult<never> { return validationFailure("Tenant and venue are required."); }
function validationFailure(message: string): ConversationResult<never> { return { status: 400, body: platformErrorBody("validation_failed", message, 400) }; }
function notFound(): ConversationResult<never> { return { status: 404, body: platformErrorBody("not_found", "Conversation not found.", 404) }; }
function storageFailure(): ConversationResult<never> { return { status: 500, body: platformErrorBody("internal_error", "Failed to access conversations.", 500) }; }
