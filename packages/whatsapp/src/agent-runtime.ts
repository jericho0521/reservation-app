import { createOpenAiCompatibleAgentRuntimeFromEnv, OpenAiCompatibleAgentRuntime } from "@reservation-platform/ai-chat";
import type { AgentRuntime } from "@reservation-platform/ai-chat";

export function createWhatsAppAgentRuntimeFromEnv(
  env: Record<string, string | undefined> = process.env,
  options: { fetch?: typeof fetch } = {},
) {
  return createOpenAiCompatibleAgentRuntimeFromEnv(env, options);
}

export function createWhatsAppAgentRuntimeFromSettings(
  settings: {
    provider?: "openai-compatible";
    baseUrl?: string;
    model?: string;
  } | undefined,
  env: Record<string, string | undefined> = process.env,
  options: { fetch?: typeof fetch } = {},
): AgentRuntime | undefined {
  if (!settings) {
    return createWhatsAppAgentRuntimeFromEnv(env, options);
  }

  const provider = settings.provider ?? "openai-compatible";
  if (provider !== "openai-compatible") {
    return undefined;
  }

  const apiKey = env.AI_AGENT_API_KEY?.trim();
  const baseUrl = settings.baseUrl?.trim() || env.AI_AGENT_BASE_URL?.trim();
  const model = settings.model?.trim() || env.AI_AGENT_MODEL?.trim();
  if (!apiKey || !baseUrl || !model) {
    return undefined;
  }

  return new OpenAiCompatibleAgentRuntime({
    apiKey,
    baseUrl,
    model,
    fetch: options.fetch,
  });
}
