# Phase 4: AI and WhatsApp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add console-managed AI and Baileys WhatsApp channels whose durable conversations and explicitly confirmed proposals use the shared appointment engine.

**Architecture:** A backend-only AI SDK adapter implements the existing `AgentRuntime`; it does not execute reservation writes itself. PostgreSQL stores conversation proposals, channel commands, pairing state, and outbox entries. The worker owns Baileys and provider calls, while the API owns authenticated configuration and reads persisted state for the console.

**Tech Stack:** Vercel AI SDK Core, `@ai-sdk/openai`, Zod/JSON Schema, Baileys, PostgreSQL jobs/outbox, AES-256-GCM, TypeScript, and Node test runner.

## Global Constraints

- Follow master-plan interfaces and Phase 3 durable job/secret contracts.
- AI SDK dependencies must not appear in `packages/ai-chat`, reservation domain packages, SDK, React, UI, booking, or console.
- Default production provider support is OpenAI; the existing raw OpenAI-compatible runtime remains an advanced compatibility adapter.
- Provider calls have a bounded timeout and may never claim an appointment exists before deterministic confirmation succeeds.
- The QR is returned only to an authenticated owner and expires from persisted pairing state.

---

### Task 1: Add the Backend-Only AI SDK Adapter

**Files:**
- Create: `packages/ai-sdk-adapter/package.json`
- Create: `packages/ai-sdk-adapter/tsconfig.json`
- Create: `packages/ai-sdk-adapter/tsconfig.build.json`
- Create: `packages/ai-sdk-adapter/src/index.ts`
- Create: `packages/ai-sdk-adapter/src/agent-runtime.ts`
- Create: `packages/ai-sdk-adapter/src/agent-runtime.test.ts`
- Create: `packages/ai-sdk-adapter/README.md`
- Modify: root `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `scripts/verify-ai-chat-boundary.mjs`

**Interfaces:**
- Consumes: `AgentRuntimeInput` and `AgentRuntimeOutput` from `@reservation-platform/ai-chat`.
- Produces: `AiSdkAgentRuntime` and `createAiSdkAgentRuntime(options)`.

- [ ] **Step 1: Write adapter contract tests with an injected generator**

```ts
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
    }),
  });
  const result = await runtime.run(agentInput({ response_schema: responseSchema }));
  assert.equal(result.message.content, "Which time works?");
  assert.deepEqual(result.data, { reply: "Which time works?", supported: true });
  assert.equal(result.metadata?.provider, "openai");
});
```

Also test timeout mapping, rate-limit mapping, invalid structured output, and tool-call mapping without tool execution.

- [ ] **Step 2: Run the package test**

Run: `pnpm --dir packages/ai-sdk-adapter run test`

Expected: FAIL because the package does not exist.

- [ ] **Step 3: Implement the provider factory**

```ts
export interface AiSdkAgentRuntimeOptions {
  provider: "openai";
  model: string;
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  generate?: typeof generateText;
}

export function createAiSdkAgentRuntime(options: AiSdkAgentRuntimeOptions): AgentRuntime {
  const provider = createOpenAI({ apiKey: options.apiKey, ...(options.baseUrl ? { baseURL: options.baseUrl } : {}) });
  return new AiSdkAgentRuntime(provider(options.model), options);
}
```

Use AI SDK `generateText`. When `response_schema` exists, pass `Output.object({ schema: jsonSchema(response_schema) })` and map `result.output` to `data`. When tools exist, map each `AgentToolDefinition` to an AI SDK tool with `inputSchema: jsonSchema(tool.input_schema)` and no `execute`, then map returned calls to existing `tool_calls`. See the official [structured output](https://ai-sdk.dev/docs/reference/ai-sdk-core/output) and [tool calling](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling) contracts.

- [ ] **Step 4: Add boundary enforcement**

Extend `verify-ai-chat-boundary.mjs` to reject imports matching `from "ai"`, `from '@ai-sdk/`, or `from "@ai-sdk/` outside `packages/ai-sdk-adapter` and backend application composition files. The adapter may import only `@reservation-platform/ai-chat`, `@reservation-platform/contract-types`, `ai`, and provider packages.

- [ ] **Step 5: Add root build/test/pack ordering**

Build `ai-chat` before `ai-sdk-adapter`, then API/worker consumers. The adapter remains private and is not part of browser package exports.

- [ ] **Step 6: Verify and commit**

Run:

```bash
pnpm --dir packages/ai-sdk-adapter run test
pnpm --dir packages/ai-sdk-adapter run build
pnpm run backend-platform:verify-chat-boundary
pnpm run packages:verify-boundaries
```

Expected: all pass.

```bash
git add packages/ai-sdk-adapter package.json pnpm-lock.yaml scripts/verify-ai-chat-boundary.mjs
git commit -m "feat(ai): add backend ai sdk adapter"
```

### Task 2: Add Owner-Managed AI Settings and Runtime Loading

**Files:**
- Modify: contracts and generated artifacts
- Modify: `packages/reservation-platform-api/src/integrations.ts`
- Modify: `packages/reservation-platform-api/src/integrations.test.ts`
- Modify: `packages/sdk/src/index.ts`
- Modify: `packages/sdk/src/index.test.ts`
- Modify: `apps/api/src/routes.ts`
- Modify: `apps/api/src/routes.test.ts`
- Modify: `apps/api/src/runtime.ts`
- Modify: `apps/api/src/runtime.test.ts`
- Create: `apps/console/app/settings/ai/page.tsx`
- Create: `apps/console/app/settings/ai/actions.ts`
- Create: `apps/console/lib/ai-settings.ts`
- Create: `apps/console/lib/ai-settings.test.ts`

**Interfaces:**
- Produces: `GET/PUT/DELETE /v1/integrations/ai`, `POST /v1/integrations/ai/test`, and `loadAgentRuntime(tenantId)`.

- [ ] **Step 1: Write contract and redaction tests**

```ts
export const aiIntegrationInputSchema = z.object({
  enabled: z.boolean(),
  provider: z.literal("openai"),
  model: z.string().trim().min(1).max(200),
  base_url: z.string().url().optional(),
  api_key: z.string().trim().min(8).max(4096).optional(),
});
```

Test that save accepts an omitted key only when one already exists, read never returns `api_key`, test connection is owner-only, and a failed test does not enable the integration.

- [ ] **Step 2: Implement per-request runtime loading**

```ts
export interface AgentRuntimeLoader {
  load(tenantId: string): Promise<AgentRuntime | undefined>;
}
```

Load current settings and decrypt the key only when an AI turn starts. Cache a runtime for at most five minutes keyed by settings `updatedAt`; clear it after save/delete. Do not store decrypted credentials in PostgreSQL, logs, audit payloads, or console state.

- [ ] **Step 3: Implement a bounded connection test**

The test calls the configured model with a short non-sensitive prompt and a five-second abort signal. Return `{ ok, provider, model, error_code? }`; never return raw provider response bodies.

- [ ] **Step 4: Build the console page**

Show provider, model, optional base URL, masked credential state, last change, test button, save/enable, disable, and revoke. The API key input is write-only and is cleared after submission.

- [ ] **Step 5: Verify and commit**

Run contract, platform API, SDK, API runtime, and console tests/builds.

```bash
git add packages/contract-types packages/reservation-platform-api/src/integrations* packages/sdk/src apps/api/src apps/console/app/settings/ai apps/console/lib/ai-settings* pnpm-lock.yaml
git commit -m "feat(ai): configure model providers from the console"
```

### Task 3: Persist Conversation Proposals and Channel Runtime State

**Files:**
- Create: `packages/database/migrations/supabase/000026_channel_runtime.sql`
- Modify: migration index and migration test
- Create: `packages/reservations-supabase/src/conversation-state.ts`
- Create: `packages/reservations-supabase/src/conversation-state.test.ts`
- Modify: `packages/reservations-supabase/src/index.ts`
- Modify: `packages/reservation-platform-api/src/conversation-orchestrator.ts`
- Modify: `packages/reservation-platform-api/src/conversation-orchestrator.test.ts`

**Interfaces:**
- Produces: persistent `ConversationBookingStateStore` and channel command/outbox records.

- [ ] **Step 1: Write persistence/claim tests**

```ts
test("proposal survives store recreation and can be claimed once", async () => {
  await firstStore.save(scope, proposal);
  assert.deepEqual(await secondStore.load(scope, proposal.proposalId), proposal);
  const claims = await Promise.all([
    firstStore.claim(scope, proposal.proposalId),
    secondStore.claim(scope, proposal.proposalId),
  ]);
  assert.deepEqual(claims.sort(), ["claimed", "in_progress"]);
});
```

- [ ] **Step 2: Add channel state tables**

Create:

```text
platform_conversation_booking_proposals
  tenant_id, venue_id, conversation_id, proposal_id, booking jsonb,
  status pending|confirming|confirmed|expired, reservation_id,
  expires_at, claimed_at, created_at, updated_at

platform_channel_commands
  tenant_id, kind, payload jsonb, status, idempotency_key, timestamps

platform_channel_outbox
  tenant_id, venue_id, conversation_id, channel, target,
  content, status pending|sending|sent|failed, provider_message_id,
  attempts, available_at, last_error_code, idempotency_key, timestamps

platform_whatsapp_pairing_state
  tenant_id unique, encrypted_qr jsonb, expires_at, updated_at
```

Use service-role-only grants and unique idempotency constraints. Expired proposals cannot be claimed.

- [ ] **Step 3: Implement the persistent store**

Map `save/load/claim/release/complete` exactly to the existing interface. `claim` uses one RPC with row locking. `complete` is idempotent for the same reservation and rejects a different reservation.

- [ ] **Step 4: Remove production in-memory proposal composition**

`apps/api/src/runtime.ts` must inject the Supabase store whenever the database runtime is enabled. `InMemoryConversationBookingStateStore` remains test/memory-mode only.

- [ ] **Step 5: Regenerate, verify, and commit**

Run migration, Supabase adapter, orchestrator, API runtime, and bundle tests.

```bash
git add packages/database packages/reservations-supabase/src/conversation-state* packages/reservations-supabase/src/index.ts packages/reservation-platform-api/src/conversation-orchestrator* apps/api/src/runtime*
git commit -m "feat(chat): persist conversational booking state"
```

### Task 4: Process AI Conversation Turns as Durable Jobs

**Files:**
- Modify: `packages/reservation-platform-api/src/conversation-orchestrator.ts`
- Modify: `packages/reservation-platform-api/src/conversation-orchestrator.test.ts`
- Create: `apps/worker/src/ai-conversation.ts`
- Create: `apps/worker/src/ai-conversation.test.ts`
- Modify: `apps/worker/src/server.ts`
- Modify: `apps/api/src/routes.ts`
- Modify: `apps/api/src/routes.test.ts`
- Modify: `apps/booking/components/public-chat.tsx`
- Modify: `apps/booking/lib/public-chat.test.ts`

**Interfaces:**
- Consumes: `conversation.process_ai` jobs, persistent messages/proposals, and `AgentRuntimeLoader`.
- Produces: persisted assistant reply/proposal and pollable conversation response.

- [ ] **Step 1: Write job-first inbound tests**

```ts
test("public inbound is persisted before the AI job is enqueued", async () => {
  await acceptConversationInbound(input, { conversations, jobs });
  assert.deepEqual(trace, ["message.persisted", "job.enqueued"]);
});

test("provider outage appends staff-handoff copy without a false booking", async () => {
  await handleAiConversationJob(job, fixture({ providerError: "model_provider_unavailable" }));
  assert.match(messages.at(-1)?.content ?? "", /staff/u);
  assert.equal(proposals.length, 0);
});
```

- [ ] **Step 2: Split acceptance from processing**

The API transaction gets/creates the conversation, deduplicates and persists inbound, and enqueues `conversation.process_ai`. It returns `202` with conversation/message IDs. The worker loads the persisted conversation and takeover state, then invokes the existing orchestrator processing path.

- [ ] **Step 3: Preserve explicit confirmation**

AI processing may save a `pending` proposal and reply. Only the existing confirmation endpoint may call `createReservation`, after rechecking availability and atomically claiming the proposal. The AI SDK tool set must not contain a direct create-reservation execute function.

- [ ] **Step 4: Update web chat polling**

After a `202`, poll messages with bounded backoff until the assistant reply or terminal handoff appears. Preserve the existing public response contract during a compatibility window if needed, but production UI uses the durable path.

- [ ] **Step 5: Verify and commit**

Run AI adapter, API, worker, booking, conversation, and omnichannel E2E tests.

```bash
git add packages/reservation-platform-api/src/conversation-orchestrator* apps/worker/src/ai-conversation* apps/worker/src/server.ts apps/api/src/routes* apps/booking
git commit -m "feat(chat): process ai turns through durable jobs"
```

### Task 5: Move Baileys Session Ownership to the Worker

**Files:**
- Modify: `packages/whatsapp/src/baileys-adapter.ts`
- Modify: `packages/whatsapp/src/baileys-adapter.test.ts`
- Modify: `packages/whatsapp/src/session.ts`
- Modify: `packages/whatsapp/src/session.test.ts`
- Modify: `packages/whatsapp/src/supabase-store.ts`
- Modify: `packages/whatsapp/src/supabase-store.test.ts`
- Create: `apps/worker/src/whatsapp.ts`
- Create: `apps/worker/src/whatsapp.test.ts`
- Modify: `apps/worker/src/server.ts`
- Modify: `apps/api/src/runtime.ts`
- Modify: `apps/api/src/routes.ts`
- Modify: contracts and SDK WhatsApp methods
- Modify: `compose.production.yml`

**Interfaces:**
- Consumes: `whatsapp.start_session`, `whatsapp.restore_session`, `whatsapp.process_inbound`, and `whatsapp.deliver_outbound` jobs.
- Produces: authenticated pairing/status/logout API backed by persisted command and session state.

- [ ] **Step 1: Write worker ownership and no-log tests**

```ts
test("pair command stores an encrypted expiring QR and never logs its payload", async () => {
  const logs: string[] = [];
  await handleWhatsAppStartJob(job, fixture({ qr: "raw-private-qr", logs }));
  assert.equal(JSON.stringify(pairingRow).includes("raw-private-qr"), false);
  assert.equal(logs.join("\n").includes("raw-private-qr"), false);
  assert.equal(decryptPairingQr(pairingRow.encrypted_qr, key), "raw-private-qr");
});
```

Also test encrypted credential restore with a key, plaintext compatibility only when no key is configured outside production, reconnect exhaustion, logout, inbound deduplication, and outbox idempotency.

- [ ] **Step 2: Make API session actions command-based**

`POST /v1/integrations/whatsapp/pair` enqueues `whatsapp.start_session` and returns `202`. `GET /status` returns persisted connection state. `GET /qr` requires owner, decrypts an unexpired pairing QR, and returns it with `Cache-Control: no-store`. `POST /logout` enqueues a logout command and clears pairing state.

- [ ] **Step 3: Compose Baileys only in the worker**

Remove the production Baileys adapter from `apps/api/src/runtime.ts`. `apps/worker/src/whatsapp.ts` creates one adapter per installation, mounts `/var/lib/reservation-platform/whatsapp`, passes `RESERVATION_WHATSAPP_SESSION_ENCRYPTION_KEY` from the secret file, restores on startup, and updates last heartbeat/status in storage.

- [ ] **Step 4: Persist inbound before processing and outbound before delivery**

The inbound callback deduplicates by provider message ID, persists the normalized message, then enqueues `conversation.process_ai` unless automation is manual. Assistant/staff responses create outbox rows; the delivery worker marks sent/failed and stores only the provider message ID.

- [ ] **Step 5: Enforce production encryption**

Production worker startup fails readiness when the WhatsApp session key is absent. `SupabaseWhatsAppModuleStore` uses `requireEncryptedCredentials: true`. Plaintext remains supported only for explicitly non-production/manual compatibility mode.

- [ ] **Step 6: Verify and commit**

Run WhatsApp, API, worker, database adapter, SDK, security, and production topology tests.

```bash
git add packages/whatsapp apps/worker apps/api/src packages/contract-types packages/sdk/src compose.production.yml
git commit -m "feat(whatsapp): run baileys in the durable channel worker"
```

### Task 6: Complete Console Pairing, Unified Inbox, and Staff Takeover

**Files:**
- Modify: `apps/console/app/channels/page.tsx`
- Modify: `apps/console/app/channels/actions.ts`
- Create: `apps/console/app/settings/whatsapp/page.tsx`
- Create: `apps/console/app/settings/whatsapp/actions.ts`
- Modify: inbox pages/components/actions
- Modify: `apps/console/lib/channel-page-state.ts`
- Modify: `apps/console/lib/channel-page-state.test.ts`
- Modify: `apps/console/lib/conversation-view.ts`
- Modify: `apps/console/lib/conversation-view.test.ts`
- Modify: conversation APIs to use outbox for staff WhatsApp replies
- Modify/Create: `tests/e2e/omnichannel-booking.e2e.ts`, `tests/e2e/staff-takeover.e2e.ts`

**Interfaces:**
- Produces: owner QR pairing/status controls and one inbox for web chat and WhatsApp with authoritative takeover.

- [ ] **Step 1: Add UI state tests**

Cover disabled, disconnected, pairing requested, QR ready, connected, reconnecting, degraded, and expired. Assert QR state is never serialized into page logs or cached output.

- [ ] **Step 2: Implement private pairing**

The owner clicks **Connect WhatsApp**, the action enqueues pairing, and the page polls status. When QR is ready it fetches with `no-store`, renders it only to the authenticated owner, and clears it immediately after connected/expired. Include reconnect and logout actions.

- [ ] **Step 3: Route staff replies through the durable outbox**

For WhatsApp, `appendStaffReply` must switch automation to manual, persist the outbound message as pending, and enqueue delivery in one transaction. The UI shows pending/sent/delivered/failed. Resume automation is explicit and audited.

- [ ] **Step 4: Prove omnichannel identity**

The E2E must show a web-chat and simulated-Baileys conversation in one inbox, an explicitly confirmed appointment from each, the same availability engine preventing a conflict, staff takeover suppressing all automated replies, and resume restoring automation.

- [ ] **Step 5: Verify and commit**

Run console, API, worker, WhatsApp, omnichannel, takeover, and production security checks.

```bash
git add apps/console packages/reservation-platform-api packages/reservations-supabase apps/api tests/e2e/omnichannel-booking.e2e.ts tests/e2e/staff-takeover.e2e.ts
git commit -m "feat(console): operate ai and whatsapp conversations"
```

## Phase 4 Exit Gate

Required evidence:

- AI SDK dependencies exist only behind the backend adapter boundary.
- Owner can save, test, disable, rotate, and revoke AI credentials without redeploying.
- Conversation proposals and turns survive API and worker restarts.
- Baileys runs in the worker, reconnects, and restores encrypted sessions.
- QR payloads and credentials are absent from logs and cached responses.
- Staff takeover suppresses all automation until explicit resume.
- AI and WhatsApp require explicit confirmation and cannot bypass conflict checks.
- Omnichannel and takeover E2E suites pass.
