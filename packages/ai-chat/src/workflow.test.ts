import assert from "node:assert/strict";
import test from "node:test";
import type { ChatAuditEvent, ChatCheckpoint, ChatModelProvider, ProviderStreamEvent } from "./index.js";
import {
  ChatWorkflowError,
  publicChatError,
  runChatWorkflow,
  streamChatWorkflow,
  toPublicStreamEvent,
} from "./index.js";

const tenantConfig = {
  scope: {
    tenant_id: "tenant_123",
    venue_id: "venue_123",
  },
};

test("disabled chat maps to public platform-shaped error", async () => {
  await assert.rejects(
    () =>
      runChatWorkflow(
        {
          tenant_config: { ...tenantConfig, module_enabled: false },
          session_id: "session_123",
          messages: [{ role: "user", content: "hello" }],
        },
        {},
      ),
    (error) => {
      assert.ok(error instanceof ChatWorkflowError);
      assert.equal(error.code, "chat_module_disabled");
      assert.equal(error.status, 404);
      return true;
    },
  );
});

test("missing provider maps to public provider unavailable error", async () => {
  await assert.rejects(
    () =>
      runChatWorkflow(
        {
          tenant_config: tenantConfig,
          session_id: "session_123",
          messages: [{ role: "user", content: "hello" }],
        },
        {},
      ),
    (error) => {
      assert.ok(error instanceof ChatWorkflowError);
      assert.equal(error.code, "model_provider_unavailable");
      assert.equal(error.status, 503);
      assert.equal(error.retryable, true);
      return true;
    },
  );
});

test("streaming provider events convert to public-safe events", async () => {
  const providerEvents: ProviderStreamEvent[] = [
    { type: "provider.delta", delta: "Hi" },
    { type: "provider.tool_call", tool_call_id: "tool_1", name: "check_availability", input: { service_id: "svc_1" } },
    {
      type: "provider.completed",
      finish_reason: "stop",
      usage: { total_tokens: 12 },
      metadata: {
        model: "profile-a",
        model_version: "2026-06",
        provider_trace_id: "secret-trace",
      },
    },
  ];

  assert.deepEqual(providerEvents.map(toPublicStreamEvent), [
    { type: "message.delta", delta: "Hi" },
    { type: "tool_call", tool_call_id: "tool_1", name: "check_availability", input: { service_id: "svc_1" } },
    {
      type: "message.completed",
      finish_reason: "stop",
      usage: { total_tokens: 12 },
      metadata: { model: "profile-a", model_version: "2026-06" },
    },
  ]);
});

test("retrieval and checkpoint ports are optional and injected", async () => {
  const auditEvents: ChatAuditEvent[] = [];
  const provider: ChatModelProvider = {
    async generate(input) {
      assert.deepEqual(input.retrieval_context, [
        {
          id: "doc_1",
          content: "Open daily.",
          score: 0.9,
          source: "policy",
          metadata: { kind: "hours" },
        },
      ]);
      assert.equal(input.checkpoint_id, "checkpoint_1");
      assert.equal(input.messages.length, 2);
      return {
        message: { role: "assistant", content: "We are open." },
        finish_reason: "stop",
      };
    },
  };
  const checkpoint: ChatCheckpoint = {
    checkpoint_id: "checkpoint_1",
    scope: tenantConfig.scope,
    session_id: "session_123",
    messages: [{ role: "assistant", content: "Earlier context." }],
  };

  const result = await runChatWorkflow(
    {
      tenant_config: tenantConfig,
      session_id: "session_123",
      messages: [{ role: "user", content: "Are you open?" }],
      retrieval_query: "hours",
      correlation_id: "corr_123",
    },
    {
      model_provider: provider,
      retriever: {
        async search(query) {
          assert.equal(query.scope.tenant_id, "tenant_123");
          assert.equal(query.query, "hours");
          return [
            {
              id: "doc_1",
              content: "Open daily.",
              score: 0.9,
              source: "policy",
              metadata: { kind: "hours" },
            },
          ];
        },
      },
      checkpoint_store: {
        async load(scope, sessionId) {
          assert.equal(scope.tenant_id, "tenant_123");
          assert.equal(sessionId, "session_123");
          return checkpoint;
        },
        async save(input) {
          assert.equal(input.messages.length, 3);
          return { ...checkpoint, checkpoint_id: "checkpoint_2", messages: input.messages };
        },
      },
      audit_sink: {
        record(event) {
          auditEvents.push(event);
        },
      },
    },
  );

  assert.equal(result.checkpoint_id, "checkpoint_2");
  assert.equal(result.output.message.content, "We are open.");
  assert.deepEqual(
    auditEvents.map((event) => event.type),
    [
      "chat.workflow.started",
      "chat.checkpoint.loaded",
      "chat.retrieval.completed",
      "chat.checkpoint.saved",
      "chat.workflow.completed",
    ],
  );
});

test("provider internals do not leak from errors", async () => {
  const publicError = publicChatError({
    code: "model_rate_limited",
    message: "Rate limited.",
    status: 429,
    request_id: "req_external",
    documentation_url: "https://docs.example.test/errors/model_rate_limited",
    idempotency: { status: "replayed" },
    details: {
      provider: "internal-provider",
      raw: "secret payload",
    },
    causes: [{ stack: "provider stack" }],
    retryable: true,
  });

  assert.deepEqual(publicError, {
    code: "model_rate_limited",
    message: "Rate limited.",
    status: 429,
  });
});

test("chat workflow errors are sanitized by publicChatError", () => {
  const publicError = publicChatError(
    new ChatWorkflowError({
      code: "model_rate_limited",
      message: "Rate limited.",
      status: 429,
      request_id: "req_123",
      retryable: true,
      documentation_url: "https://docs.example.test/errors/model_rate_limited",
      idempotency: { status: "replayed" },
      details: { provider: "internal-provider", raw: "secret payload" },
    }),
  );

  assert.deepEqual(publicError, {
    code: "model_rate_limited",
    message: "Rate limited.",
    status: 429,
    request_id: "req_123",
    retryable: true,
    documentation_url: "https://docs.example.test/errors/model_rate_limited",
    idempotency: { status: "replayed" },
  });
});

test("run workflow records failed audit and sanitizes provider errors", async () => {
  const auditEvents: ChatAuditEvent[] = [];
  const provider: ChatModelProvider = {
    async generate() {
      throw {
        code: "model_rate_limited",
        message: "Rate limited.",
        status: 429,
        request_id: "req_provider_private",
        retryable: true,
        details: {
          provider_trace_id: "trace_secret",
          raw_payload: "secret payload",
        },
      };
    },
  };

  await assert.rejects(
    () =>
      runChatWorkflow(
        {
          tenant_config: tenantConfig,
          session_id: "session_123",
          messages: [{ role: "user", content: "hello" }],
          correlation_id: "corr_123",
        },
        {
          model_provider: provider,
          audit_sink: {
            record(event) {
              auditEvents.push(event);
            },
          },
        },
      ),
    (error) => {
      assert.ok(error instanceof ChatWorkflowError);
      assert.equal(error.code, "model_rate_limited");
      assert.equal(error.status, 429);
      assert.equal(error.request_id, undefined);
      assert.equal(error.retryable, undefined);
      assert.equal(error.details, undefined);
      return true;
    },
  );

  assert.deepEqual(
    auditEvents.map((event) => event.type),
    ["chat.workflow.started", "chat.workflow.failed"],
  );
  assert.deepEqual(auditEvents[1]?.error, {
    code: "model_rate_limited",
    message: "Rate limited.",
    status: 429,
  });
});

test("run workflow preserves provider error when audit recording fails", async () => {
  const provider: ChatModelProvider = {
    async generate() {
      throw {
        code: "model_rate_limited",
        message: "Rate limited.",
        status: 429,
        details: { raw_payload: "secret payload" },
      };
    },
  };

  await assert.rejects(
    () =>
      runChatWorkflow(
        {
          tenant_config: tenantConfig,
          session_id: "session_123",
          messages: [{ role: "user", content: "hello" }],
        },
        {
          model_provider: provider,
          audit_sink: {
            async record() {
              throw new Error("audit unavailable");
            },
          },
        },
      ),
    (error) => {
      assert.ok(error instanceof ChatWorkflowError);
      assert.equal(error.code, "model_rate_limited");
      assert.equal(error.status, 429);
      assert.equal(error.details, undefined);
      return true;
    },
  );
});

test("stream workflow yields public provider error when audit recording fails", async () => {
  const provider: ChatModelProvider = {
    async generate() {
      throw new Error("unused");
    },
    async *stream() {
      throw {
        code: "model_rate_limited",
        message: "Rate limited.",
        status: 429,
        details: { raw_payload: "secret payload" },
      };
    },
  };

  const events = [];
  for await (const event of streamChatWorkflow(
    {
      tenant_config: tenantConfig,
      session_id: "session_123",
      messages: [{ role: "user", content: "hello" }],
    },
    {
      model_provider: provider,
      audit_sink: {
        async record() {
          throw new Error("audit unavailable");
        },
      },
    },
  )) {
    events.push(event);
  }

  assert.deepEqual(events, [
    {
      type: "error",
      error: {
        code: "model_rate_limited",
        message: "Rate limited.",
        status: 429,
      },
    },
  ]);
});

test("stream workflow yields sanitized errors when provider throws", async () => {
  const provider: ChatModelProvider = {
    async generate() {
      throw new Error("unused");
    },
    async *stream() {
      throw new Error("provider stack with token");
    },
  };

  const events = [];
  for await (const event of streamChatWorkflow(
    {
      tenant_config: tenantConfig,
      session_id: "session_123",
      messages: [{ role: "user", content: "hello" }],
    },
    { model_provider: provider },
  )) {
    events.push(event);
  }

  assert.deepEqual(events, [
    {
      type: "error",
      error: {
        code: "model_provider_unavailable",
        message: "Chat model provider is unavailable.",
        status: 503,
        retryable: true,
      },
    },
  ]);
});

test("stream workflow treats provider.error event as terminal failure", async () => {
  const auditEvents: ChatAuditEvent[] = [];
  let saveCalls = 0;
  const provider: ChatModelProvider = {
    async generate() {
      throw new Error("unused");
    },
    async *stream() {
      yield { type: "provider.delta", delta: "Partial" };
      yield {
        type: "provider.error",
        error: {
          code: "model_rate_limited",
          message: "Rate limited.",
          status: 429,
          request_id: "req_external",
          retryable: true,
        },
      };
      yield { type: "provider.completed", finish_reason: "stop" };
    },
  };

  const events = [];
  for await (const event of streamChatWorkflow(
    {
      tenant_config: tenantConfig,
      session_id: "session_123",
      messages: [{ role: "user", content: "hello" }],
    },
    {
      model_provider: provider,
      checkpoint_store: {
        async load() {
          return undefined;
        },
        async save() {
          saveCalls += 1;
          throw new Error("checkpoint should not be saved");
        },
      },
      audit_sink: {
        record(event) {
          auditEvents.push(event);
        },
      },
    },
  )) {
    events.push(event);
  }

  assert.deepEqual(events, [
    { type: "message.delta", delta: "Partial" },
    {
      type: "error",
      error: {
        code: "model_rate_limited",
        message: "Rate limited.",
        status: 429,
      },
    },
  ]);
  assert.equal(saveCalls, 0);
  assert.deepEqual(
    auditEvents.map((event) => event.type),
    ["chat.workflow.started", "chat.workflow.failed"],
  );
  assert.deepEqual(auditEvents[1]?.error, {
    code: "model_rate_limited",
    message: "Rate limited.",
    status: 429,
  });
});

test("stream workflow fails when provider stream ends without completion", async () => {
  const auditEvents: ChatAuditEvent[] = [];
  let saveCalls = 0;
  const provider: ChatModelProvider = {
    async generate() {
      throw new Error("unused");
    },
    async *stream() {
      yield { type: "provider.delta", delta: "Partial" };
    },
  };

  const events = [];
  for await (const event of streamChatWorkflow(
    {
      tenant_config: tenantConfig,
      session_id: "session_123",
      messages: [{ role: "user", content: "hello" }],
    },
    {
      model_provider: provider,
      checkpoint_store: {
        async load() {
          return undefined;
        },
        async save() {
          saveCalls += 1;
          throw new Error("checkpoint should not be saved");
        },
      },
      audit_sink: {
        record(event) {
          auditEvents.push(event);
        },
      },
    },
  )) {
    events.push(event);
  }

  assert.deepEqual(events, [
    { type: "message.delta", delta: "Partial" },
    {
      type: "error",
      error: {
        code: "model_provider_unavailable",
        message: "Chat model provider is unavailable.",
        status: 503,
        retryable: true,
      },
    },
  ]);
  assert.equal(saveCalls, 0);
  assert.deepEqual(
    auditEvents.map((event) => event.type),
    ["chat.workflow.started", "chat.workflow.failed"],
  );
  assert.deepEqual(auditEvents[1]?.error, {
    code: "model_provider_unavailable",
    message: "Chat model provider is unavailable.",
    status: 503,
    retryable: true,
  });
});

test("stream workflow sanitizes chat workflow error output", async () => {
  const provider: ChatModelProvider = {
    async generate() {
      throw new Error("unused");
    },
    async *stream() {
      throw new ChatWorkflowError({
        code: "model_rate_limited",
        message: "Rate limited.",
        status: 429,
        request_id: "req_456",
        retryable: true,
        details: { provider: "internal-provider", raw: "secret payload" },
      });
    },
  };

  const events = [];
  for await (const event of streamChatWorkflow(
    {
      tenant_config: tenantConfig,
      session_id: "session_123",
      messages: [{ role: "user", content: "hello" }],
    },
    { model_provider: provider },
  )) {
    events.push(event);
  }

  assert.deepEqual(events, [
    {
      type: "error",
      error: {
        code: "model_rate_limited",
        message: "Rate limited.",
        status: 429,
        request_id: "req_456",
        retryable: true,
      },
    },
  ]);
});

test("plain platform-shaped provider errors do not leak public extras while chat workflow errors preserve safe fields", async () => {
  const plainProviderErrorEvents = [];
  const plainProvider: ChatModelProvider = {
    async generate() {
      throw new Error("unused");
    },
    async *stream() {
      yield {
        type: "provider.error",
        error: {
          code: "model_rate_limited",
          message: "Rate limited.",
          status: 429,
          request_id: "req_external",
          documentation_url: "https://docs.example.test/errors/model_rate_limited",
          idempotency: { status: "replayed" },
          retryable: true,
          details: { raw: "secret" },
        },
      };
    },
  };

  for await (const event of streamChatWorkflow(
    {
      tenant_config: tenantConfig,
      session_id: "session_plain",
      messages: [{ role: "user", content: "hello" }],
    },
    { model_provider: plainProvider },
  )) {
    plainProviderErrorEvents.push(event);
  }

  assert.deepEqual(plainProviderErrorEvents, [
    {
      type: "error",
      error: {
        code: "model_rate_limited",
        message: "Rate limited.",
        status: 429,
      },
    },
  ]);

  const chatWorkflowErrorEvents = [];
  const chatWorkflowProvider: ChatModelProvider = {
    async generate() {
      throw new Error("unused");
    },
    async *stream() {
      yield {
        type: "provider.error",
        error: new ChatWorkflowError({
          code: "model_rate_limited",
          message: "Rate limited.",
          status: 429,
          request_id: "req_internal",
          documentation_url: "https://docs.example.test/errors/model_rate_limited",
          idempotency: { status: "replayed" },
          retryable: true,
          details: { raw: "secret" },
        }),
      };
    },
  };

  for await (const event of streamChatWorkflow(
    {
      tenant_config: tenantConfig,
      session_id: "session_internal",
      messages: [{ role: "user", content: "hello" }],
    },
    { model_provider: chatWorkflowProvider },
  )) {
    chatWorkflowErrorEvents.push(event);
  }

  assert.deepEqual(chatWorkflowErrorEvents, [
    {
      type: "error",
      error: {
        code: "model_rate_limited",
        message: "Rate limited.",
        status: 429,
        request_id: "req_internal",
        documentation_url: "https://docs.example.test/errors/model_rate_limited",
        idempotency: { status: "replayed" },
        retryable: true,
      },
    },
  ]);
});

test("stream workflow loads and saves checkpoints and records audit lifecycle", async () => {
  const auditEvents: ChatAuditEvent[] = [];
  const checkpoint: ChatCheckpoint = {
    checkpoint_id: "checkpoint_1",
    scope: tenantConfig.scope,
    session_id: "session_123",
    messages: [{ role: "assistant", content: "Earlier context." }],
  };

  const provider: ChatModelProvider = {
    async generate() {
      throw new Error("unused");
    },
    async *stream(input) {
      assert.equal(input.checkpoint_id, "checkpoint_1");
      assert.equal(input.messages.length, 2);
      yield { type: "provider.delta", delta: "Hello" };
      yield { type: "provider.tool_call", tool_call_id: "tool_1", name: "lookup", input: { item: "hours" } };
      yield {
        type: "provider.completed",
        finish_reason: "stop",
        usage: { total_tokens: 9 },
        metadata: { model: "profile-a", private_trace: "secret" },
      };
    },
  };

  const events = [];
  for await (const event of streamChatWorkflow(
    {
      tenant_config: tenantConfig,
      session_id: "session_123",
      messages: [{ role: "user", content: "hello" }],
      correlation_id: "corr_123",
    },
    {
      model_provider: provider,
      checkpoint_store: {
        async load(scope, sessionId) {
          assert.equal(scope.tenant_id, "tenant_123");
          assert.equal(sessionId, "session_123");
          return checkpoint;
        },
        async save(input) {
          assert.equal(input.messages.length, 3);
          assert.deepEqual(input.messages[2], {
            role: "assistant",
            content: "Hello\n[tool:lookup]",
          });
          return { ...checkpoint, checkpoint_id: "checkpoint_2", messages: input.messages };
        },
      },
      audit_sink: {
        record(event) {
          auditEvents.push(event);
        },
      },
    },
  )) {
    events.push(event);
  }

  assert.deepEqual(events, [
    { type: "message.delta", delta: "Hello" },
    { type: "tool_call", tool_call_id: "tool_1", name: "lookup", input: { item: "hours" } },
    {
      type: "message.completed",
      finish_reason: "stop",
      usage: { total_tokens: 9 },
      metadata: { model: "profile-a" },
    },
  ]);
  assert.deepEqual(
    auditEvents.map((event) => event.type),
    [
      "chat.workflow.started",
      "chat.checkpoint.loaded",
      "chat.checkpoint.saved",
      "chat.workflow.completed",
    ],
  );
});

test("stream workflow records failed audit lifecycle", async () => {
  const auditEvents: ChatAuditEvent[] = [];
  const provider: ChatModelProvider = {
    async generate() {
      throw new Error("unused");
    },
    async *stream() {
      throw new ChatWorkflowError({
        code: "model_rate_limited",
        message: "Rate limited.",
        status: 429,
        details: { provider: "internal-provider" },
      });
    },
  };

  const events = [];
  for await (const event of streamChatWorkflow(
    {
      tenant_config: tenantConfig,
      session_id: "session_123",
      messages: [{ role: "user", content: "hello" }],
    },
    {
      model_provider: provider,
      audit_sink: {
        record(event) {
          auditEvents.push(event);
        },
      },
    },
  )) {
    events.push(event);
  }

  assert.equal(events.length, 1);
  assert.deepEqual(
    auditEvents.map((event) => event.type),
    ["chat.workflow.started", "chat.workflow.failed"],
  );
  assert.deepEqual(auditEvents[1]?.error, {
    code: "model_rate_limited",
    message: "Rate limited.",
    status: 429,
  });
});
