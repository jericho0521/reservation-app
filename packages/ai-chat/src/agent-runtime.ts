import type { JsonValue, MetadataRecord } from "@reservation-platform/contract-types";
import type { ChatMessage } from "./messages.js";
import type { ModelRetrievalContext } from "./model-provider.js";
import type { ChatTenantScope } from "./tenant-config.js";

export interface AgentToolDefinition {
  name: string;
  description?: string;
  input_schema?: JsonValue;
}

export interface AgentRuntimeInput {
  scope: ChatTenantScope;
  messages: ChatMessage[];
  system_prompt?: string;
  retrieval_context?: ModelRetrievalContext[];
  tools?: AgentToolDefinition[];
  response_schema?: JsonValue;
  metadata?: MetadataRecord;
}

export interface AgentRuntimeOutput {
  message: ChatMessage;
  data?: JsonValue;
  tool_calls?: Array<{
    tool_call_id: string;
    name: string;
    input: JsonValue;
  }>;
  metadata?: MetadataRecord;
}

export interface AgentRuntime {
  readonly provider_id?: string;
  run(input: AgentRuntimeInput): Promise<AgentRuntimeOutput>;
}

