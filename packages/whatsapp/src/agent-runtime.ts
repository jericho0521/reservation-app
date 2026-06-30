import { createOpenAiCompatibleAgentRuntimeFromEnv } from "@reservation-platform/ai-chat";

export function createWhatsAppAgentRuntimeFromEnv(
  env: Record<string, string | undefined> = process.env,
  options: { fetch?: typeof fetch } = {},
) {
  return createOpenAiCompatibleAgentRuntimeFromEnv(env, options);
}

