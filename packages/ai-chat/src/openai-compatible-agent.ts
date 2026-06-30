import type { JsonValue, MetadataRecord, PlatformErrorBody } from "@reservation-platform/contract-types";
import type { AgentRuntime, AgentRuntimeInput, AgentRuntimeOutput } from "./agent-runtime.js";
import type { ChatMessage } from "./messages.js";

export interface OpenAiCompatibleAgentOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  fetch?: typeof fetch;
  temperature?: number;
  maxOutputTokens?: number;
}

export class OpenAiCompatibleAgentRuntime implements AgentRuntime {
  readonly provider_id = "openai-compatible";
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;
  private readonly temperature?: number;
  private readonly maxOutputTokens?: number;

  constructor(options: OpenAiCompatibleAgentOptions) {
    this.apiKey = normalizeRequired(options.apiKey, "AI agent API key");
    this.baseUrl = normalizeRequired(options.baseUrl, "AI agent base URL").replace(/\/+$/u, "");
    this.model = normalizeRequired(options.model, "AI agent model");
    this.fetchImpl = options.fetch ?? fetch;
    this.temperature = options.temperature;
    this.maxOutputTokens = options.maxOutputTokens;
  }

  async run(input: AgentRuntimeInput): Promise<AgentRuntimeOutput> {
    const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        messages: buildMessages(input),
        temperature: this.temperature ?? 0.2,
        max_tokens: this.maxOutputTokens,
        response_format: input.response_schema ? { type: "json_object" } : undefined,
      }),
    });

    if (!response.ok) {
      throw providerError(response.status);
    }

    const body = await response.json() as OpenAiCompatibleChatCompletion;
    const content = body.choices?.[0]?.message?.content?.trim() ?? "";
    const parsed = parseJsonObject(content);

    return {
      message: {
        role: "assistant",
        content: typeof parsed?.reply === "string" ? parsed.reply : content,
      },
      data: parsed,
      metadata: compactMetadata({
        provider: this.provider_id,
        model: this.model,
        finish_reason: body.choices?.[0]?.finish_reason,
      }),
    };
  }
}

export function createOpenAiCompatibleAgentRuntimeFromEnv(
  env: Record<string, string | undefined> = process.env,
  options: Pick<OpenAiCompatibleAgentOptions, "fetch"> = {},
): AgentRuntime | undefined {
  const provider = env.AI_AGENT_PROVIDER?.trim();
  if (provider && provider !== "openai-compatible") {
    return undefined;
  }

  const apiKey = env.AI_AGENT_API_KEY?.trim();
  const baseUrl = env.AI_AGENT_BASE_URL?.trim();
  const model = env.AI_AGENT_MODEL?.trim();
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

interface OpenAiCompatibleChatCompletion {
  choices?: Array<{
    message?: {
      content?: string;
    };
    finish_reason?: string;
  }>;
}

function buildMessages(input: AgentRuntimeInput) {
  const messages: Array<{ role: ChatMessage["role"]; content: string }> = [];
  if (input.system_prompt) {
    messages.push({ role: "system", content: input.system_prompt });
  }
  if (input.retrieval_context?.length) {
    messages.push({
      role: "system",
      content: `Business knowledge:\n${input.retrieval_context.map((entry) => `- ${entry.content}`).join("\n")}`,
    });
  }
  for (const message of input.messages) {
    if (message.role !== "tool") {
      messages.push({ role: message.role, content: message.content });
    }
  }
  return messages;
}

function parseJsonObject(content: string): Record<string, JsonValue> | undefined {
  try {
    const parsed = JSON.parse(content) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, JsonValue>
      : undefined;
  } catch {
    return undefined;
  }
}

function providerError(status: number): PlatformErrorBody {
  return {
    code: status === 429 ? "model_rate_limited" : "model_provider_unavailable",
    message: status === 429 ? "AI model rate limit reached." : "AI model provider is unavailable.",
    status: status === 429 ? 429 : 503,
    retryable: true,
  };
}

function normalizeRequired(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${label} is required.`);
  }
  return normalized;
}

function compactMetadata(input: Record<string, string | undefined>): MetadataRecord {
  return Object.fromEntries(
    Object.entries(input).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0),
  );
}

