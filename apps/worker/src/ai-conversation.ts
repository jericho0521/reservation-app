import {
  PlatformJobProcessingError,
  createAgentConversationResponder,
  processPersistedConversationInbound,
  type AgentRuntimeLoader,
  type ConversationOrchestratorDependencies,
} from "@reservation-platform/api";
import type { PlatformJobHandler, WorkerPlatformJob } from "./runtime.js";

export type AiConversationProcessingDependencies = Omit<ConversationOrchestratorDependencies, "responder">;

export interface AiConversationJobHandlerOptions {
  runtimeLoader: Pick<AgentRuntimeLoader, "load">;
  loadDependencies(scope: {
    tenantId: string;
    venueId: string;
  }): Promise<AiConversationProcessingDependencies> | AiConversationProcessingDependencies;
}

export function createAiConversationJobHandler(
  options: AiConversationJobHandlerOptions,
): PlatformJobHandler {
  return async (job) => {
    const input = parseAiConversationJob(job);
    const scope = { tenantId: job.tenantId, venueId: job.venueId! };
    const dependencies = await options.loadDependencies(scope);
    let runtime;
    try {
      runtime = await options.runtimeLoader.load(scope.tenantId);
    } catch {
      runtime = undefined;
    }
    const unavailable = {
      async respond(): Promise<never> {
        throw new Error("AI runtime is unavailable.");
      },
    };
    const responder = runtime
      ? createAgentConversationResponder(runtime, unavailable)
      : unavailable;
    const result = await processPersistedConversationInbound({
      scope,
      conversationId: input.conversationId,
      messageId: input.messageId,
      dependencies: { ...dependencies, responder },
    });

    if (result.status >= 500) {
      throw new PlatformJobProcessingError("network_error");
    }
    if (result.status >= 400) {
      throw new PlatformJobProcessingError("invalid_conversation_job");
    }
  };
}

function parseAiConversationJob(job: WorkerPlatformJob) {
  const conversationId = stringValue(job.payload.conversationId);
  const messageId = stringValue(job.payload.messageId);
  if (
    job.kind !== "conversation.process_ai"
    || !stringValue(job.tenantId)
    || !stringValue(job.venueId)
    || !conversationId
    || !messageId
  ) {
    throw new PlatformJobProcessingError("invalid_conversation_job");
  }
  return { conversationId, messageId };
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
