import { createOpenAI } from "@ai-sdk/openai";
import type {
  AgentRuntime,
  AgentRuntimeInput,
  AgentRuntimeOutput,
} from "@reservation-platform/ai-chat";
import type {
  JsonValue,
  MetadataRecord,
  PlatformErrorBody,
} from "@reservation-platform/contract-types";
import {
  generateText,
  jsonSchema,
  Output,
  tool,
  type ModelMessage,
  type ToolSet,
} from "ai";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 1_024;

export interface AiSdkGenerationResult {
  text: string;
  output?: unknown;
  toolCalls?: Array<{
    toolCallId: string;
    toolName: string;
    input: unknown;
  }>;
  response?: {
    modelId?: string;
  };
  finishReason?: string;
}

export type AiSdkGenerate = (
  options: Parameters<typeof generateText>[0],
) => Promise<AiSdkGenerationResult>;

export interface AiSdkAgentRuntimeOptions {
  provider: "openai";
  model: string;
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxOutputTokens?: number;
  generate?: AiSdkGenerate;
}

export class AiSdkAgentRuntime implements AgentRuntime {
  readonly provider_id = "openai";
  private readonly modelId: string;
  private readonly model: ReturnType<ReturnType<typeof createOpenAI>>;
  private readonly timeoutMs: number;
  private readonly maxOutputTokens: number;
  private readonly generate: AiSdkGenerate;

  constructor(options: AiSdkAgentRuntimeOptions) {
    this.modelId = normalizeRequired(options.model, "AI model");
    this.timeoutMs = normalizeTimeout(options.timeoutMs);
    this.maxOutputTokens = normalizeMaxOutputTokens(options.maxOutputTokens);
    this.generate = options.generate ?? defaultGenerate;

    const provider = createOpenAI({
      apiKey: normalizeRequired(options.apiKey, "AI API key"),
      ...(options.baseUrl
        ? { baseURL: normalizeRequired(options.baseUrl, "AI base URL") }
        : {}),
    });
    this.model = provider(this.modelId);
  }

  async run(input: AgentRuntimeInput): Promise<AgentRuntimeOutput> {
    const controller = new AbortController();
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;

    try {
      const generation = this.generate({
        model: this.model,
        system: buildSystemPrompt(input),
        messages: buildMessages(input),
        tools: buildTools(input),
        output: buildOutput(input),
        maxOutputTokens: this.maxOutputTokens,
        abortSignal: controller.signal,
      });

      const result = await Promise.race([
        generation,
        new Promise<never>((_resolve, reject) => {
          timeoutHandle = setTimeout(() => {
            timedOut = true;
            controller.abort();
            reject(timeoutError());
          }, this.timeoutMs);
        }),
      ]);

      const data = readStructuredOutput(input, result.output);
      const toolCalls = readToolCalls(result.toolCalls);

      return {
        message: {
          role: "assistant",
          content: structuredReply(data) ?? result.text.trim(),
        },
        data,
        tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        metadata: compactMetadata({
          provider: this.provider_id,
          model: result.response?.modelId ?? this.modelId,
          finish_reason: result.finishReason,
        }),
      };
    } catch (error) {
      if (isPlatformError(error)) {
        throw error;
      }
      if (timedOut) {
        throw timeoutError();
      }
      throw providerError(error);
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }
}

export function createAiSdkAgentRuntime(
  options: AiSdkAgentRuntimeOptions,
): AgentRuntime {
  if (options.provider !== "openai") {
    throw new Error(`Unsupported AI SDK provider: ${String(options.provider)}`);
  }
  return new AiSdkAgentRuntime(options);
}

const defaultGenerate: AiSdkGenerate = async (options) => {
  return await generateText(options);
};

function buildSystemPrompt(input: AgentRuntimeInput): string | undefined {
  const sections = [input.system_prompt?.trim()];
  if (input.retrieval_context?.length) {
    sections.push(
      `Business knowledge:\n${input.retrieval_context
        .map((entry) => `- ${entry.content}`)
        .join("\n")}`,
    );
  }
  for (const message of input.messages) {
    if (message.role === "system" && message.content.trim()) {
      sections.push(message.content.trim());
    }
  }
  const prompt = sections.filter((section): section is string => Boolean(section)).join("\n\n");
  return prompt || undefined;
}

function buildMessages(input: AgentRuntimeInput): ModelMessage[] {
  return input.messages.flatMap((message): ModelMessage[] => {
    if (message.role !== "user" && message.role !== "assistant") {
      return [];
    }
    return [{ role: message.role, content: message.content }];
  });
}

function buildTools(input: AgentRuntimeInput): ToolSet | undefined {
  if (!input.tools?.length) {
    return undefined;
  }

  return Object.fromEntries(input.tools.map((definition) => [
    definition.name,
    tool({
      description: definition.description,
      inputSchema: jsonSchema(
        (definition.input_schema ?? { type: "object", properties: {} }) as Parameters<typeof jsonSchema>[0],
      ),
    }),
  ]));
}

function buildOutput(input: AgentRuntimeInput) {
  if (!input.response_schema) {
    return undefined;
  }
  return Output.object({
    schema: jsonSchema<Record<string, JsonValue>>(
      input.response_schema as Parameters<typeof jsonSchema>[0],
    ),
  });
}

function readStructuredOutput(
  input: AgentRuntimeInput,
  output: unknown,
): JsonValue | undefined {
  if (!input.response_schema) {
    return undefined;
  }
  if (!isJsonValue(output) || !output || Array.isArray(output) || typeof output !== "object") {
    throw invalidStructuredOutputError();
  }
  return output;
}

function readToolCalls(toolCalls: AiSdkGenerationResult["toolCalls"]): NonNullable<AgentRuntimeOutput["tool_calls"]> {
  return (toolCalls ?? []).map((call) => {
    if (!isJsonValue(call.input)) {
      throw invalidStructuredOutputError();
    }
    return {
      tool_call_id: call.toolCallId,
      name: call.toolName,
      input: call.input,
    };
  });
}

function structuredReply(data: JsonValue | undefined): string | undefined {
  if (!data || Array.isArray(data) || typeof data !== "object") {
    return undefined;
  }
  return typeof data.reply === "string" ? data.reply : undefined;
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  if (typeof value === "object") {
    return Object.values(value).every(isJsonValue);
  }
  return false;
}

function providerError(error: unknown): PlatformErrorBody {
  if (readStatusCode(error) === 429) {
    return {
      code: "model_rate_limited",
      message: "AI model rate limit reached.",
      status: 429,
      retryable: true,
    };
  }
  return {
    code: "model_provider_unavailable",
    message: "AI model provider is unavailable.",
    status: 503,
    retryable: true,
  };
}

function timeoutError(): PlatformErrorBody {
  return {
    code: "model_provider_unavailable",
    message: "AI model provider timed out.",
    status: 503,
    retryable: true,
  };
}

function invalidStructuredOutputError(): PlatformErrorBody {
  return {
    code: "model_provider_unavailable",
    message: "AI model returned an invalid structured response.",
    status: 503,
    retryable: true,
  };
}

function readStatusCode(error: unknown, depth = 0): number | undefined {
  if (!error || typeof error !== "object" || depth > 2) {
    return undefined;
  }
  const candidate = error as { statusCode?: unknown; status?: unknown; cause?: unknown };
  if (typeof candidate.statusCode === "number") {
    return candidate.statusCode;
  }
  if (typeof candidate.status === "number") {
    return candidate.status;
  }
  return readStatusCode(candidate.cause, depth + 1);
}

function isPlatformError(value: unknown): value is PlatformErrorBody {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<PlatformErrorBody>;
  return (
    typeof candidate.code === "string" &&
    typeof candidate.message === "string" &&
    typeof candidate.status === "number"
  );
}

function normalizeRequired(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${label} is required.`);
  }
  return normalized;
}

function normalizeTimeout(value: number | undefined): number {
  const timeoutMs = value ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("AI provider timeout must be greater than zero.");
  }
  return timeoutMs;
}

function normalizeMaxOutputTokens(value: number | undefined): number {
  const maxOutputTokens = value ?? DEFAULT_MAX_OUTPUT_TOKENS;
  if (!Number.isSafeInteger(maxOutputTokens) || maxOutputTokens <= 0) {
    throw new Error("AI maximum output tokens must be a positive integer.");
  }
  return maxOutputTokens;
}

function compactMetadata(input: Record<string, string | undefined>): MetadataRecord {
  return Object.fromEntries(
    Object.entries(input).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0,
    ),
  );
}
