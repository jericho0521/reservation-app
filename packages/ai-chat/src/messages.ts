import type { JsonValue, MetadataRecord } from "@reservation-platform/contract-types";

export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  id?: string;
  role: ChatRole;
  content: string;
  name?: string;
  tool_call_id?: string;
  metadata?: MetadataRecord;
}

export interface ChatToolDefinition {
  name: string;
  description?: string;
  input_schema?: JsonValue;
}

export interface PublicChatMessage {
  role: Extract<ChatRole, "assistant" | "user" | "tool">;
  content: string;
  metadata?: MetadataRecord;
}

