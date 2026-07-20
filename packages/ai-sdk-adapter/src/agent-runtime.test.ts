import assert from "node:assert/strict";
import test from "node:test";

import type { AgentRuntimeInput } from "@reservation-platform/ai-chat";
import { createAiSdkAgentRuntime } from "./agent-runtime.js";

const responseSchema = {
  type: "object",
  properties: {
    reply: { type: "string" },
    supported: { type: "boolean" },
  },
  required: ["reply", "supported"],
  additionalProperties: false,
} as const;

test("maps structured output to the existing AgentRuntime contract", async () => {
  const runtime = createAiSdkAgentRuntime({
    provider: "openai",
    model: "test-model",
    apiKey: "test-key",
    generate: async () => ({
      text: "",
      output: { reply: "Which time works?", supported: true },
      toolCalls: [],
      response: { modelId: "test-model" },
      finishReason: "stop",
    }),
  });

  const result = await runtime.run(agentInput({ response_schema: responseSchema }));

  assert.equal(result.message.content, "Which time works?");
  assert.deepEqual(result.data, { reply: "Which time works?", supported: true });
  assert.deepEqual(result.metadata, {
    provider: "openai",
    model: "test-model",
    finish_reason: "stop",
  });
});

test("maps tool calls without executing tools", async () => {
  let generateOptions: Record<string, unknown> | undefined;
  const runtime = createAiSdkAgentRuntime({
    provider: "openai",
    model: "test-model",
    apiKey: "test-key",
    generate: async (options) => {
      generateOptions = options;
      return {
        text: "I can check that.",
        toolCalls: [{
          toolCallId: "call_1",
          toolName: "check_availability",
          input: { date: "2026-07-18" },
        }],
        response: { modelId: "test-model" },
        finishReason: "tool-calls",
      };
    },
  });

  const result = await runtime.run(agentInput({
    tools: [{
      name: "check_availability",
      description: "Find open appointment times.",
      input_schema: {
        type: "object",
        properties: { date: { type: "string" } },
        required: ["date"],
      },
    }],
  }));

  assert.deepEqual(result.tool_calls, [{
    tool_call_id: "call_1",
    name: "check_availability",
    input: { date: "2026-07-18" },
  }]);
  const tools = generateOptions?.tools as Record<string, { execute?: unknown }>;
  assert.equal(typeof tools.check_availability, "object");
  assert.equal(tools.check_availability.execute, undefined);
});

test("maps provider rate limits to a retryable platform error", async () => {
  const runtime = createAiSdkAgentRuntime({
    provider: "openai",
    model: "test-model",
    apiKey: "test-key",
    generate: async () => {
      throw Object.assign(new Error("provider detail that must not escape"), { statusCode: 429 });
    },
  });

  await assert.rejects(runtime.run(agentInput()), (error: unknown) => {
    assert.deepEqual(error, {
      code: "model_rate_limited",
      message: "AI model rate limit reached.",
      status: 429,
      retryable: true,
    });
    return true;
  });
});

test("bounds generated output tokens and supports a smaller connection-test limit", async () => {
  const generatedLimits: unknown[] = [];
  const generate = async (options: Record<string, unknown>) => {
    generatedLimits.push(options.maxOutputTokens);
    return {
      text: "OK",
      toolCalls: [],
      response: { modelId: "test-model" },
      finishReason: "stop",
    };
  };
  const defaultRuntime = createAiSdkAgentRuntime({
    provider: "openai",
    model: "test-model",
    apiKey: "test-key",
    generate,
  });
  const connectionTestRuntime = createAiSdkAgentRuntime({
    provider: "openai",
    model: "test-model",
    apiKey: "test-key",
    maxOutputTokens: 16,
    generate,
  });

  await defaultRuntime.run(agentInput());
  await connectionTestRuntime.run(agentInput());

  assert.deepEqual(generatedLimits, [1_024, 16]);
});

test("bounds provider calls with a timeout", async () => {
  const runtime = createAiSdkAgentRuntime({
    provider: "openai",
    model: "test-model",
    apiKey: "test-key",
    timeoutMs: 5,
    generate: async () => await new Promise(() => undefined),
  });

  await assert.rejects(runtime.run(agentInput()), (error: unknown) => {
    assert.deepEqual(error, {
      code: "model_provider_unavailable",
      message: "AI model provider timed out.",
      status: 503,
      retryable: true,
    });
    return true;
  });
});

test("rejects an invalid structured output", async () => {
  const runtime = createAiSdkAgentRuntime({
    provider: "openai",
    model: "test-model",
    apiKey: "test-key",
    generate: async () => ({
      text: "not structured",
      output: undefined,
      toolCalls: [],
      response: { modelId: "test-model" },
      finishReason: "stop",
    }),
  });

  await assert.rejects(
    runtime.run(agentInput({ response_schema: responseSchema })),
    (error: unknown) => {
      assert.deepEqual(error, {
        code: "model_provider_unavailable",
        message: "AI model returned an invalid structured response.",
        status: 503,
        retryable: true,
      });
      return true;
    },
  );
});

function agentInput(overrides: Partial<AgentRuntimeInput> = {}): AgentRuntimeInput {
  return {
    scope: { tenant_id: "tenant_1", venue_id: "venue_1" },
    messages: [{ role: "user", content: "I need an appointment." }],
    system_prompt: "Help the customer arrange an appointment.",
    ...overrides,
  };
}
