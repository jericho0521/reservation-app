import type { JsonValue, MetadataRecord, PlatformErrorBody } from "@reservation-platform/contract-types";
import type { ChatMessage, ChatToolDefinition } from "./messages.js";
import type { ChatTenantScope } from "./tenant-config.js";

export interface ModelGenerationInput {
  scope: ChatTenantScope;
  messages: ChatMessage[];
  tools?: ChatToolDefinition[];
  retrieval_context?: ModelRetrievalContext[];
  checkpoint_id?: string;
  options?: ModelGenerationOptions;
  metadata?: MetadataRecord;
}

export interface ModelGenerationOptions {
  temperature?: number;
  max_output_tokens?: number;
  response_format?: "text" | "json";
  abort_signal?: AbortSignal;
}

export interface ModelRetrievalContext {
  id: string;
  content: string;
  source?: string;
  score?: number;
  metadata?: MetadataRecord;
}

export interface ModelToolCall {
  tool_call_id: string;
  name: string;
  input: JsonValue;
}

export interface ModelUsage {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
}

export interface ModelGenerationOutput {
  message: ChatMessage;
  tool_calls?: ModelToolCall[];
  usage?: ModelUsage;
  finish_reason?: string;
  metadata?: MetadataRecord;
}

export type ProviderStreamEvent =
  | { type: "provider.delta"; delta: string }
  | { type: "provider.tool_call"; tool_call_id: string; name: string; input: JsonValue }
  | { type: "provider.completed"; finish_reason: string; usage?: ModelUsage; metadata?: MetadataRecord }
  | { type: "provider.error"; error: PlatformErrorBody | Error | unknown };

export interface ChatModelProvider {
  readonly provider_id?: string;
  generate(input: ModelGenerationInput): Promise<ModelGenerationOutput>;
  stream?(input: ModelGenerationInput): AsyncIterable<ProviderStreamEvent>;
}

export type PublicChatStreamEvent =
  | { type: "message.delta"; delta: string }
  | { type: "tool_call"; tool_call_id: string; name: string; input: JsonValue }
  | { type: "message.completed"; finish_reason: string; usage?: ModelUsage; metadata?: MetadataRecord }
  | { type: "error"; error: PlatformErrorBody };

