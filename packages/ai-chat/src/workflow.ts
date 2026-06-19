import type { JsonValue, MetadataRecord, PlatformErrorBody } from "@reservation-platform/contract-types";
import type { ChatAuditSink } from "./audit.js";
import type { ChatCheckpointStore } from "./checkpoint.js";
import {
  ChatWorkflowError,
  invalidChatTenantScopeError,
  modelProviderUnavailableError,
  moduleDisabledError,
  publicChatError,
} from "./errors.js";
import type {
  ChatModelProvider,
  ModelGenerationOutput,
  ModelRetrievalContext,
  ProviderStreamEvent,
  PublicChatStreamEvent,
} from "./model-provider.js";
import type { ChatMessage, ChatToolDefinition } from "./messages.js";
import type { ChatRetriever } from "./retrieval.js";
import { normalizeChatTenantConfig, type ChatTenantConfig } from "./tenant-config.js";

export interface ChatWorkflowDependencies {
  model_provider?: ChatModelProvider;
  retriever?: ChatRetriever;
  checkpoint_store?: ChatCheckpointStore;
  audit_sink?: ChatAuditSink;
}

export interface RunChatWorkflowInput {
  tenant_config: ChatTenantConfig;
  session_id: string;
  messages: ChatMessage[];
  tools?: ChatToolDefinition[];
  retrieval_query?: string;
  checkpoint_state?: JsonValue;
  correlation_id?: string;
}

export interface RunChatWorkflowResult {
  output: ModelGenerationOutput;
  checkpoint_id?: string;
}

export async function runChatWorkflow(
  input: RunChatWorkflowInput,
  dependencies: ChatWorkflowDependencies,
): Promise<RunChatWorkflowResult> {
  input = normalizeChatWorkflowInput(input);
  assertWorkflowEnabled(input.tenant_config, dependencies);
  await recordAudit(input, dependencies, "chat.workflow.started");

  try {
    const loaded = await dependencies.checkpoint_store?.load(
      input.tenant_config.scope,
      input.session_id,
    );
    if (loaded) {
      await recordAudit(input, dependencies, "chat.checkpoint.loaded", {
        checkpoint_id: loaded.checkpoint_id,
      });
    }

    const retrievalContext = await getRetrievalContext(input, dependencies);
    const output = await dependencies.model_provider.generate({
      scope: input.tenant_config.scope,
      messages: [...(loaded?.messages ?? []), ...input.messages],
      tools: input.tools,
      retrieval_context: retrievalContext,
      checkpoint_id: loaded?.checkpoint_id,
    });

    const saved = await dependencies.checkpoint_store?.save({
      scope: input.tenant_config.scope,
      session_id: input.session_id,
      messages: [...(loaded?.messages ?? []), ...input.messages, output.message],
      state: input.checkpoint_state,
    });
    if (saved) {
      await recordAudit(input, dependencies, "chat.checkpoint.saved", {
        checkpoint_id: saved.checkpoint_id,
      });
    }

    await recordAudit(input, dependencies, "chat.workflow.completed", {
      checkpoint_id: saved?.checkpoint_id ?? null,
      finish_reason: output.finish_reason ?? null,
    });

    return {
      output,
      checkpoint_id: saved?.checkpoint_id,
    };
  } catch (error) {
    const publicError = publicChatError(error);
    await recordAudit(input, dependencies, "chat.workflow.failed", undefined, publicError);
    throw new ChatWorkflowError(publicError);
  }
}

export async function* streamChatWorkflow(
  input: RunChatWorkflowInput,
  dependencies: ChatWorkflowDependencies,
): AsyncIterable<PublicChatStreamEvent> {
  input = normalizeChatWorkflowInput(input);
  assertWorkflowEnabled(input.tenant_config, dependencies);

  try {
    await recordAudit(input, dependencies, "chat.workflow.started");
    if (!dependencies.model_provider.stream) {
      throw new ChatWorkflowError(modelProviderUnavailableError());
    }

    const loaded = await dependencies.checkpoint_store?.load(
      input.tenant_config.scope,
      input.session_id,
    );
    if (loaded) {
      await recordAudit(input, dependencies, "chat.checkpoint.loaded", {
        checkpoint_id: loaded.checkpoint_id,
      });
    }

    const retrievalContext = await getRetrievalContext(input, dependencies);
    const events = dependencies.model_provider.stream({
      scope: input.tenant_config.scope,
      messages: [...(loaded?.messages ?? []), ...input.messages],
      tools: input.tools,
      retrieval_context: retrievalContext,
      checkpoint_id: loaded?.checkpoint_id,
    });
    const transcript = createStreamTranscriptCollector();
    let completion:
      | Extract<ProviderStreamEvent, { type: "provider.completed" }>
      | undefined;

    for await (const event of events) {
      if (event.type === "provider.error") {
        throw new ChatWorkflowError(publicChatError(event.error));
      }

      transcript.consume(event);
      if (event.type === "provider.completed") {
        completion = event;
      }
      yield toPublicStreamEvent(event);
    }

    if (!completion) {
      throw new ChatWorkflowError(modelProviderUnavailableError());
    }

    const saved = await maybeSaveStreamCheckpoint(input, dependencies, loaded?.messages, transcript.content());
    if (saved) {
      await recordAudit(input, dependencies, "chat.checkpoint.saved", {
        checkpoint_id: saved.checkpoint_id,
      });
    }

    await recordAudit(input, dependencies, "chat.workflow.completed", {
      checkpoint_id: saved?.checkpoint_id ?? null,
      finish_reason: completion?.finish_reason ?? null,
    });
  } catch (error) {
    const publicError = publicChatError(error);
    await recordAudit(input, dependencies, "chat.workflow.failed", undefined, publicError);
    yield { type: "error", error: publicError };
  }
}

export function toPublicStreamEvent(event: ProviderStreamEvent): PublicChatStreamEvent {
  switch (event.type) {
    case "provider.delta":
      return { type: "message.delta", delta: event.delta };
    case "provider.tool_call":
      return {
        type: "tool_call",
        tool_call_id: event.tool_call_id,
        name: event.name,
        input: event.input,
      };
    case "provider.completed":
      return omitUndefined({
        type: "message.completed",
        finish_reason: event.finish_reason,
        usage: event.usage,
        metadata: sanitizePublicCompletionMetadata(event.metadata),
      });
    case "provider.error":
      return { type: "error", error: publicChatError(event.error) };
  }
}

async function maybeSaveStreamCheckpoint(
  input: RunChatWorkflowInput,
  dependencies: ChatWorkflowDependencies,
  loadedMessages: ChatMessage[] | undefined,
  assistantTranscript: string,
) {
  if (!dependencies.checkpoint_store) {
    return undefined;
  }

  return dependencies.checkpoint_store.save({
    scope: input.tenant_config.scope,
    session_id: input.session_id,
    messages: [
      ...(loadedMessages ?? []),
      ...input.messages,
      { role: "assistant", content: assistantTranscript },
    ],
    state: input.checkpoint_state,
  });
}

function createStreamTranscriptCollector() {
  const parts: string[] = [];

  return {
    consume(event: ProviderStreamEvent) {
      switch (event.type) {
        case "provider.delta":
          parts.push(event.delta);
          break;
        case "provider.tool_call":
          parts.push(`\n[tool:${event.name}]`);
          break;
        default:
          break;
      }
    },
    content() {
      return parts.join("").trim();
    },
  };
}

function sanitizePublicCompletionMetadata(metadata?: MetadataRecord): MetadataRecord | undefined {
  if (!metadata) {
    return undefined;
  }

  const sanitized: MetadataRecord = {};

  if (typeof metadata.model === "string") {
    sanitized.model = metadata.model;
  }
  if (typeof metadata.model_id === "string") {
    sanitized.model_id = metadata.model_id;
  }
  if (typeof metadata.model_version === "string") {
    sanitized.model_version = metadata.model_version;
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

function omitUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}

function assertWorkflowEnabled(
  tenantConfig: ChatTenantConfig,
  dependencies: ChatWorkflowDependencies,
): asserts dependencies is ChatWorkflowDependencies & { model_provider: ChatModelProvider } {
  if (tenantConfig.module_enabled === false) {
    throw new ChatWorkflowError(moduleDisabledError());
  }

  if (!dependencies.model_provider) {
    throw new ChatWorkflowError(modelProviderUnavailableError());
  }
}

function normalizeChatWorkflowInput(input: RunChatWorkflowInput): RunChatWorkflowInput {
  const tenantConfig = normalizeChatTenantConfig(input.tenant_config);
  if (!tenantConfig) {
    throw new ChatWorkflowError(invalidChatTenantScopeError());
  }

  return {
    ...input,
    tenant_config: tenantConfig,
  };
}

async function getRetrievalContext(
  input: RunChatWorkflowInput,
  dependencies: ChatWorkflowDependencies,
): Promise<ModelRetrievalContext[] | undefined> {
  if (!dependencies.retriever || !input.retrieval_query) {
    return undefined;
  }

  const results = await dependencies.retriever.search({
    scope: input.tenant_config.scope,
    query: input.retrieval_query,
  });
  await recordAudit(input, dependencies, "chat.retrieval.completed", {
    count: results.length,
  });

  return results.map((result) => ({
    id: result.id,
    content: result.content,
    source: result.source,
    score: result.score,
    metadata: result.metadata,
  }));
}

async function recordAudit(
  input: RunChatWorkflowInput,
  dependencies: ChatWorkflowDependencies,
  type: Parameters<NonNullable<ChatAuditSink["record"]>>[0]["type"],
  data?: JsonValue,
  error?: PlatformErrorBody,
): Promise<void> {
  try {
    await dependencies.audit_sink?.record({
      type,
      scope: input.tenant_config.scope,
      session_id: input.session_id,
      correlation_id: input.correlation_id,
      data,
      error,
    });
  } catch {
    // Audit is best-effort; it must not alter public chat workflow behavior.
  }
}
