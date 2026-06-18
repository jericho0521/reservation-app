import type { JsonValue, MetadataRecord } from "@reservation-platform/contract-types";
import type { ChatMessage } from "./messages.js";
import type { ChatTenantScope } from "./tenant-config.js";

export interface ChatCheckpoint {
  checkpoint_id: string;
  scope: ChatTenantScope;
  session_id: string;
  messages: ChatMessage[];
  state?: JsonValue;
  metadata?: MetadataRecord;
  updated_at?: string;
}

export interface SaveChatCheckpointInput {
  scope: ChatTenantScope;
  session_id: string;
  messages: ChatMessage[];
  state?: JsonValue;
  metadata?: MetadataRecord;
}

export interface ChatCheckpointStore {
  load(scope: ChatTenantScope, session_id: string): Promise<ChatCheckpoint | null>;
  save(input: SaveChatCheckpointInput): Promise<ChatCheckpoint>;
}

