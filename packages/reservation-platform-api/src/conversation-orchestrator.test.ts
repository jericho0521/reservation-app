import assert from "node:assert/strict";
import test from "node:test";
import type { ConversationMessageResponse, ConversationResponse, ReservationResponse } from "@reservation-platform/contract-types";
import {
  acceptConversationInbound,
  confirmConversationBooking,
  handleConversationInbound,
  InMemoryConversationBookingStateStore,
  processPersistedConversationInbound,
  type ConversationBookingTools,
  type ConversationOrchestratorDependencies,
} from "./conversation-orchestrator.js";
import type { ConversationAppendInput, ConversationRepository } from "./conversations.js";

const scope = { tenantId: "tenant_1", venueId: "venue_1" };
const preparedBooking = {
  service_id: "service_1",
  service_name: "Simulator Session",
  date: "2026-08-10",
  start_time: "14:00",
  seats: 1,
  user_name: "Alex",
  user_email: "alex@example.com",
  user_phone: "+60123456789",
};

test("unsupported inbound requests persist a safe reply without reservation mutation", async () => {
  const fixture = createFixture({ responder: { content: "Please wait while staff checks this for you.", supported: false } });
  const result = await inbound(fixture.dependencies, "Can you repair my laptop?");
  assert.equal(result.status, 200);
  assert.equal("proposal" in result.body, false);
  assert.equal(fixture.createCalls.length, 0);
  assert.equal(fixture.messages.at(-1)?.content, "Please wait while staff checks this for you.");
});

test("hallucinated service ids cannot become booking proposals", async () => {
  const fixture = createFixture({ responder: { content: "Please confirm.", supported: true, booking: { ...preparedBooking, service_id: "invented" } } });
  const result = await inbound(fixture.dependencies);
  assert.equal(result.status, 200);
  assert.equal("proposal" in result.body, false);
  assert.equal(fixture.state.proposals.size, 0);
  assert.equal(fixture.createCalls.length, 0);
  assert.match(fixture.messages.at(-1)?.content ?? "", /could not verify/u);
});

test("a proposal waits for explicit confirmation and confirmation replays idempotently", async () => {
  const fixture = createFixture({ responder: { content: "Please confirm the 2pm slot.", supported: true, booking: preparedBooking } });
  const proposed = await inbound(fixture.dependencies);
  assert.equal(proposed.status, 200);
  assert.equal("proposal" in proposed.body, true);
  assert.equal(fixture.createCalls.length, 0);
  const proposalId = "proposal" in proposed.body ? proposed.body.proposal?.proposalId : undefined;
  assert.equal(proposalId, "proposal_1");

  const first = await confirmConversationBooking({ scope, conversationId: "conversation_1", proposalId: proposalId!, dependencies: fixture.dependencies });
  const replay = await confirmConversationBooking({ scope, conversationId: "conversation_1", proposalId: proposalId!, dependencies: fixture.dependencies });
  assert.equal(first.status, 200);
  assert.equal(replay.status, 200);
  assert.equal(fixture.createCalls.length, 1);
  assert.equal(fixture.appendInputs.filter((input) => input.metadata?.event === "booking.confirmation_requested").length, 1);
  assert.equal(fixture.createCalls[0]?.idempotencyKey, "conversation-confirm-proposal_1");
  assert.equal("reservation" in replay.body && replay.body.reservation?.reservation_id, "reservation_1");
});

test("assigned-resource proposals bind real available resources before confirmation", async () => {
  const fixture = createFixture({ responder: { content: "Please confirm the 2pm slot.", supported: true, booking: preparedBooking } });
  fixture.dependencies.tools.getService = async () => ({
    service_id: "service_1",
    name: "Simulator Session",
    resource_kind: "station",
    resource_strategy: "assigned_resource",
  });
  fixture.dependencies.tools.checkAvailability = async () => ({
    slots: [{ start_time: "14:00", end_time: "15:00", available_quantity: 1, is_available: true, maintenance_resource_labels: ["Simulator B"] }],
    resources: [
      { resource_id: "resource_1", service_id: "service_1", label: "Simulator A", is_active: true, capacity: 1 },
      { resource_id: "resource_2", service_id: "service_1", label: "Simulator B", is_active: true, capacity: 1 },
    ],
  });
  const proposed = await inbound(fixture.dependencies);
  const proposalId = "proposal" in proposed.body ? proposed.body.proposal?.proposalId : undefined;
  const confirmed = await confirmConversationBooking({ scope, conversationId: "conversation_1", proposalId: proposalId!, dependencies: fixture.dependencies });
  assert.equal(confirmed.status, 200);
  assert.deepEqual((fixture.createCalls[0]?.input as { resource_ids?: string[] }).resource_ids, ["resource_1"]);
  assert.deepEqual((fixture.createCalls[0]?.input as { reservation_items?: unknown[] }).reservation_items, [
    { resource_id: "resource_1", resource_label: "Simulator A", quantity: 1 },
  ]);
});

test("stale availability blocks confirmation before reservation creation", async () => {
  const fixture = createFixture({ responder: { content: "Please confirm.", supported: true, booking: preparedBooking } });
  const proposed = await inbound(fixture.dependencies);
  const proposalId = "proposal" in proposed.body ? proposed.body.proposal?.proposalId : undefined;
  fixture.available = false;
  const result = await confirmConversationBooking({ scope, conversationId: "conversation_1", proposalId: proposalId!, dependencies: fixture.dependencies });
  assert.equal(result.status, 409);
  assert.equal(fixture.createCalls.length, 0);
});

test("manual takeover suppresses the responder and all automated replies", async () => {
  const fixture = createFixture({ automationState: "manual", responder: { content: "must not send", supported: true, booking: preparedBooking } });
  const result = await inbound(fixture.dependencies);
  assert.equal(result.status, 200);
  assert.equal("automation_suppressed" in result.body && result.body.automation_suppressed, true);
  assert.equal(fixture.responderCalls, 0);
  assert.equal(fixture.messages.filter((message) => message.direction === "outbound").length, 0);
});

test("provider and tool failures append a staff handoff without a false booking", async () => {
  const fixture = createFixture({ responder: { content: "Please confirm.", supported: true, booking: preparedBooking }, toolFailure: true });
  const result = await inbound(fixture.dependencies);
  assert.equal(result.status, 200);
  assert.match(fixture.messages.at(-1)?.content ?? "", /staff/u);
  assert.equal(fixture.createCalls.length, 0);
  assert.equal(fixture.audits.at(-1)?.type, "conversation.workflow.failed");
  assert.doesNotMatch(JSON.stringify(fixture.audits), /database password|provider stack/u);
});

test("durable inbound persists before enqueue and the worker processes it", async () => {
  const fixture = createFixture({ responder: { content: "How can I help?", supported: true } });
  const trace: string[] = [];
  const originalAppend = fixture.dependencies.conversations.append;
  fixture.dependencies.conversations.append = async (...args) => {
    const result = await originalAppend(...args);
    if (args[2].direction === "inbound") trace.push("message.persisted");
    return result;
  };
  const accepted = await acceptConversationInbound({
    scope,
    message: { channel: "web_chat", channelThreadId: "thread_1", externalMessageId: "external_2", content: "Hello", participant: { displayName: "Alex" } },
    conversations: fixture.dependencies.conversations,
    jobs: { async enqueue(job) { trace.push("job.enqueued"); assert.equal(job.kind, "conversation.process_ai"); return { jobId: "job_1" }; } },
  });
  assert.equal(accepted.status, 202);
  assert.deepEqual(trace, ["message.persisted", "job.enqueued"]);
  const processed = await processPersistedConversationInbound({
    scope,
    conversationId: "conversation_1",
    messageId: "message_1",
    dependencies: fixture.dependencies,
  });
  assert.equal(processed.status, 200);
  assert.equal(fixture.messages.filter((message) => message.direction === "outbound").length, 1);
  assert.equal(fixture.appendInputs.at(-1)?.externalMessageId, "ai-reply:message_1");
});

test("persisted WhatsApp confirmation consumes the latest proposal exactly once", async () => {
  const fixture = createFixture({ channel: "whatsapp", responder: { content: "Please confirm the 2pm slot.", supported: true, booking: preparedBooking } });
  const accepted = await acceptConversationInbound({
    scope,
    message: { channel: "whatsapp", channelThreadId: "60123@s.whatsapp.net", externalMessageId: "wamid-book", content: "Book the simulator", participant: { channelIdentifier: "60123@s.whatsapp.net" } },
    conversations: fixture.dependencies.conversations,
    jobs: { async enqueue() { return { jobId: "job_1" }; } },
  });
  assert.equal(accepted.status, 202);
  const proposed = await processPersistedConversationInbound({
    scope,
    conversationId: "conversation_1",
    messageId: "message_1",
    dependencies: fixture.dependencies,
  });
  assert.equal(proposed.status, 200);

  const firstInbound = await fixture.dependencies.conversations.append(scope, "conversation_1", {
    channel: "whatsapp",
    direction: "inbound",
    senderType: "customer",
    deliveryState: "delivered",
    externalMessageId: "wamid-confirm-1",
    content: "confirm",
  });
  const first = await processPersistedConversationInbound({
    scope,
    conversationId: "conversation_1",
    messageId: firstInbound.data!.message_id,
    dependencies: fixture.dependencies,
  });
  assert.equal(first.status, 200);
  assert.equal("reservation" in first.body && first.body.reservation?.reservation_id, "reservation_1");

  const replayInbound = await fixture.dependencies.conversations.append(scope, "conversation_1", {
    channel: "whatsapp",
    direction: "inbound",
    senderType: "customer",
    deliveryState: "delivered",
    externalMessageId: "wamid-confirm-2",
    content: "confirm",
  });
  const replay = await processPersistedConversationInbound({
    scope,
    conversationId: "conversation_1",
    messageId: replayInbound.data!.message_id,
    dependencies: fixture.dependencies,
  });
  assert.equal(replay.status, 200);
  assert.equal(fixture.createCalls.length, 1);
  assert.equal(fixture.responderCalls, 2);
});

test("persisted WhatsApp yes without an active proposal follows the responder path", async () => {
  const fixture = createFixture({
    channel: "whatsapp",
    responder: { content: "Yes — how can I help with your booking?", supported: true },
  });
  const accepted = await acceptConversationInbound({
    scope,
    message: {
      channel: "whatsapp",
      channelThreadId: "60123@s.whatsapp.net",
      externalMessageId: "wamid-yes-without-proposal",
      content: "yes",
      participant: { channelIdentifier: "60123@s.whatsapp.net" },
    },
    conversations: fixture.dependencies.conversations,
    jobs: { async enqueue() { return { jobId: "job_1" }; } },
  });
  assert.equal(accepted.status, 202);

  const processed = await processPersistedConversationInbound({
    scope,
    conversationId: "conversation_1",
    messageId: "message_1",
    dependencies: fixture.dependencies,
  });

  assert.equal(processed.status, 200);
  assert.equal(fixture.responderCalls, 1);
  assert.equal(fixture.messages.at(-1)?.content, "Yes — how can I help with your booking?");
  assert.equal(fixture.messages.at(-1)?.direction, "outbound");
});

test("WhatsApp automation replies persist through the durable outbox operation", async () => {
  const fixture = createFixture({ channel: "whatsapp", responder: { content: "Choose a service.", supported: true } });
  let outboxCalls = 0;
  const append = fixture.dependencies.conversations.append;
  fixture.dependencies.conversations.appendAutomationReplyWithOutbox = async (...args) => {
    outboxCalls += 1;
    return append(...args);
  };
  const result = await handleConversationInbound({
    scope,
    message: { channel: "whatsapp", channelThreadId: "60123@s.whatsapp.net", externalMessageId: "wamid-1", content: "Hello", participant: { channelIdentifier: "60123@s.whatsapp.net" } },
    dependencies: fixture.dependencies,
  });
  assert.equal(result.status, 200);
  assert.equal(outboxCalls, 1);
  assert.equal(fixture.appendInputs.at(-1)?.deliveryState, "pending");
});

function createFixture(options: {
  automationState?: "automated" | "manual";
  channel?: "web_chat" | "whatsapp";
  responder: { content: string; supported: boolean; booking?: typeof preparedBooking };
  toolFailure?: boolean;
}) {
  const state = new InMemoryConversationBookingStateStore();
  const messages: ConversationMessageResponse[] = [];
  const createCalls: Array<{ input: unknown; idempotencyKey: string }> = [];
  const appendInputs: ConversationAppendInput[] = [];
  const audits: Array<{ type: string }> = [];
  let responderCalls = 0;
  let available = true;
  const conversation: ConversationResponse = {
    conversation_id: "conversation_1",
    tenant_id: scope.tenantId,
    venue_id: scope.venueId,
    channel: options.channel ?? "web_chat",
    status: "active",
    automation_state: options.automationState ?? "automated",
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
  };
  const conversations: ConversationRepository = {
    list: async () => ({ data: [conversation] }),
    get: async () => ({ data: conversation }),
    getOrCreate: async () => ({ data: conversation }),
    listMessages: async () => ({ data: [...messages].reverse() }),
    append: async (_scope, conversationId, input) => {
      appendInputs.push(input);
      const message: ConversationMessageResponse = {
        message_id: `message_${messages.length + 1}`,
        conversation_id: conversationId,
        channel: input.channel,
        direction: input.direction,
        sender_type: input.senderType,
        delivery_state: input.deliveryState ?? "sent",
        content: input.content,
        ...(input.reservationId ? { reservation_id: input.reservationId } : {}),
        created_at: `2026-08-01T00:0${messages.length}:00.000Z`,
      };
      messages.push(message);
      return { data: message };
    },
    updateAutomation: async () => ({ data: conversation }),
  };
  const tools: ConversationBookingTools = {
    async getService(_scope, serviceId) {
      if (options.toolFailure) throw new Error("database password provider stack");
      return serviceId === "service_1" ? { service_id: "service_1", name: "Simulator Session" } : undefined;
    },
    async checkAvailability() {
      return { slots: [{ start_time: "14:00", end_time: "15:00", available_quantity: available ? 2 : 0, is_available: available }] };
    },
    async createReservation(_scope, input, idempotencyKey) {
      createCalls.push({ input, idempotencyKey });
      return { reservation_id: "reservation_1", service_id: input.service_id, status: "confirmed", quantity: input.quantity } satisfies ReservationResponse;
    },
  };
  const dependencies: ConversationOrchestratorDependencies = {
    conversations,
    state,
    tools,
    responder: { async respond() { responderCalls += 1; return options.responder; } },
    loadExperience: async () => ({ businessName: "Apex Racing", knowledge: [], services: [] }),
    createProposalId: () => "proposal_1",
    audit: { record(event) { audits.push({ type: event.type }); } },
  };
  return {
    dependencies,
    state,
    messages,
    createCalls,
    appendInputs,
    audits,
    get responderCalls() { return responderCalls; },
    get available() { return available; },
    set available(value: boolean) { available = value; },
  };
}

function inbound(dependencies: ConversationOrchestratorDependencies, content = "Book the simulator") {
  return handleConversationInbound({
    scope,
    message: { channel: "web_chat", channelThreadId: "thread_1", externalMessageId: "external_1", content, participant: { displayName: "Alex" } },
    dependencies,
  });
}
