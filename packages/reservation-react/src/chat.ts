import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ConversationBookingProposalResponse,
  ConversationMessageResponse,
  PublicChatConversationResponse,
  ReservationResponse,
} from "@reservation-platform/contract-types";
import type { ReservationPlatformClient } from "@reservation-platform/sdk";

export interface PublicChatState {
  threadId: string;
  conversationId?: string;
  messages: ConversationMessageResponse[];
  proposal?: ConversationBookingProposalResponse;
  reservation?: ReservationResponse;
  loading: boolean;
  restoring: boolean;
  error?: string;
  failedMessage?: string;
  handoff: boolean;
}

export type PublicChatAction =
  | { type: "restore_started" }
  | { type: "restored"; conversationId: string; messages: ConversationMessageResponse[] }
  | { type: "request_started"; content?: string; messageId?: string }
  | { type: "response_received"; response: PublicChatConversationResponse }
  | { type: "request_failed"; message: string; failedMessage?: string }
  | { type: "clear_error" };

export function reducePublicChat(state: PublicChatState, action: PublicChatAction): PublicChatState {
  switch (action.type) {
    case "restore_started": return { ...state, restoring: true, error: undefined };
    case "restored": return { ...state, restoring: false, conversationId: action.conversationId, messages: action.messages };
    case "request_started": return {
      ...state,
      loading: true,
      error: undefined,
      failedMessage: undefined,
      messages: action.content && action.messageId ? [...state.messages, {
        message_id: `local:${action.messageId}`,
        conversation_id: state.conversationId ?? "pending",
        channel: "web_chat",
        direction: "inbound",
        sender_type: "customer",
        delivery_state: "pending",
        content: action.content,
        created_at: new Date().toISOString(),
      }] : state.messages,
    };
    case "response_received": return {
      ...state,
      loading: false,
      restoring: false,
      conversationId: action.response.conversation_id,
      messages: action.response.message ? appendUniqueMessage(state.messages, action.response.message) : state.messages,
      proposal: action.response.proposal,
      reservation: action.response.reservation ?? state.reservation,
      handoff: action.response.automation_suppressed === true || action.response.automation_state === "manual",
    };
    case "request_failed": return { ...state, loading: false, restoring: false, error: action.message, failedMessage: action.failedMessage };
    case "clear_error": return { ...state, error: undefined, failedMessage: undefined };
  }
}

export interface PublicChatStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function publicChatStorageKeys(slug: string) {
  return { thread: `reservation-chat:${slug}:thread`, conversation: `reservation-chat:${slug}:conversation` };
}

export function getOrCreatePublicChatThread(storage: PublicChatStorage, slug: string, createId: () => string = secureChatId) {
  const key = publicChatStorageKeys(slug).thread;
  const existing = storage.getItem(key)?.trim();
  if (existing) return existing;
  const created = createId();
  storage.setItem(key, created);
  return created;
}

export function usePublicChat(input: {
  client: Pick<ReservationPlatformClient, "sendPublicChatMessage" | "listPublicChatMessages" | "confirmPublicChatBooking">;
  slug: string;
  storage?: PublicChatStorage;
  createId?: () => string;
}) {
  const storage = input.storage ?? (typeof window === "undefined" ? undefined : window.localStorage);
  const [state, setState] = useState<PublicChatState>(() => ({
    threadId: storage ? getOrCreatePublicChatThread(storage, input.slug, input.createId) : "server-pending",
    messages: [], loading: false, restoring: true, handoff: false,
  }));
  const keys = useMemo(() => publicChatStorageKeys(input.slug), [input.slug]);

  useEffect(() => {
    if (!storage) return;
    const threadId = getOrCreatePublicChatThread(storage, input.slug, input.createId);
    const conversationId = storage.getItem(keys.conversation)?.trim();
    setState((current) => ({ ...current, threadId }));
    if (!conversationId) {
      setState((current) => ({ ...current, restoring: false }));
      return;
    }
    setState((current) => reducePublicChat(current, { type: "restore_started" }));
    void input.client.listPublicChatMessages(input.slug, conversationId, { limit: 100 }).then((result) => {
      setState((current) => reducePublicChat(current, { type: "restored", conversationId, messages: result.messages }));
    }).catch(() => {
      storage.removeItem(keys.conversation);
      setState((current) => reducePublicChat(current, { type: "request_failed", message: "The previous conversation could not be restored. Start a new message." }));
    });
  }, [input.client, input.slug, keys.conversation, storage]);

  const send = useCallback(async (content: string) => {
    const normalized = content.trim();
    if (!normalized || state.loading) return;
    const externalMessageId = secureChatId();
    setState((current) => reducePublicChat(current, { type: "request_started", content: normalized, messageId: externalMessageId }));
    try {
      const response = await input.client.sendPublicChatMessage(input.slug, {
        thread_id: state.threadId,
        external_message_id: externalMessageId,
        content: normalized,
      });
      storage?.setItem(keys.conversation, response.conversation_id);
      setState((current) => reducePublicChat(current, { type: "response_received", response }));
    } catch (error) {
      setState((current) => reducePublicChat(current, { type: "request_failed", message: errorMessage(error), failedMessage: normalized }));
    }
  }, [input.client, input.slug, keys.conversation, state.loading, state.threadId, storage]);

  const confirm = useCallback(async () => {
    if (!state.conversationId || !state.proposal || state.loading) return;
    setState((current) => reducePublicChat(current, { type: "request_started" }));
    try {
      const response = await input.client.confirmPublicChatBooking(input.slug, state.conversationId, { proposal_id: state.proposal.proposal_id });
      setState((current) => reducePublicChat(current, { type: "response_received", response }));
    } catch (error) {
      setState((current) => reducePublicChat(current, { type: "request_failed", message: errorMessage(error) }));
    }
  }, [input.client, input.slug, state.conversationId, state.loading, state.proposal]);

  const retry = useCallback(() => state.failedMessage ? send(state.failedMessage) : Promise.resolve(), [send, state.failedMessage]);
  return { state, send, confirm, retry, clearError: () => setState((current) => reducePublicChat(current, { type: "clear_error" })) };
}

function appendUniqueMessage(messages: ConversationMessageResponse[], message: ConversationMessageResponse) {
  return messages.some((candidate) => candidate.message_id === message.message_id) ? messages : [...messages, message];
}

function secureChatId(): string {
  const id = globalThis.crypto?.randomUUID?.();
  if (!id) throw new Error("Secure chat id generation is unavailable.");
  return id;
}

function errorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : "The assistant could not respond. Please try again.";
}
