import assert from "node:assert/strict";
import test from "node:test";
import type {
  ConversationBookingStateStore,
  ConversationOrchestratorDependencies,
} from "@reservation-platform/api";
import type {
  ConversationMessageResponse,
  ConversationResponse,
} from "@reservation-platform/contract-types";
import { createAiConversationJobHandler } from "./ai-conversation.js";

const scope = { tenantId: "tenant_1", venueId: "venue_1" };

test("AI jobs persist a proposal without creating a reservation", async () => {
  const fixture = createFixture();
  const handler = createAiConversationJobHandler({
    runtimeLoader: {
      async load() {
        return {
          async run() {
            return {
              message: { content: "Please confirm the appointment." },
              data: {
                reply: "Please confirm the appointment.",
                supported: true,
                booking: {
                  service_id: "service_1",
                  service_name: "Consultation",
                  date: "2026-08-10",
                  start_time: "14:00",
                  seats: 1,
                  user_name: "Alex",
                  user_email: "alex@example.com",
                  user_phone: "+60123456789",
                },
              },
            };
          },
        };
      },
    },
    loadDependencies: () => fixture.dependencies,
  });

  await handler(job());

  assert.equal(fixture.proposals.length, 1);
  assert.equal(fixture.createCalls, 0);
  assert.equal(fixture.messages.at(-1)?.direction, "outbound");
  assert.match(fixture.messages.at(-1)?.content ?? "", /confirm/u);
  assert.equal(fixture.appendExternalIds.at(-1), "ai-reply:message_inbound");
});

test("provider outage falls back without exposing provider details or creating a booking", async () => {
  const fixture = createFixture();
  const handler = createAiConversationJobHandler({
    runtimeLoader: {
      async load() {
        return { async run() { throw new Error("provider response with secret details"); } };
      },
    },
    loadDependencies: () => fixture.dependencies,
  });

  await handler(job());

  assert.equal(fixture.proposals.length, 0);
  assert.equal(fixture.createCalls, 0);
  assert.match(fixture.messages.at(-1)?.content ?? "", /Book <service>/u);
  assert.doesNotMatch(fixture.messages.at(-1)?.content ?? "", /secret|provider response/u);
  assert.equal(fixture.appendExternalIds.at(-1), "ai-reply:message_inbound");
});

test("missing AI configuration uses the deterministic responder for booking proposals", async () => {
  const fixture = createFixture(
    "automated",
    "Book Consultation on 2026-08-10 at 14:00 for 1; Alex; alex@example.com; +60123456789",
  );
  const handler = createAiConversationJobHandler({
    runtimeLoader: {
      async load() {
        throw new Error("AI configuration is unavailable.");
      },
    },
    loadDependencies: () => fixture.dependencies,
  });

  await handler(job());

  assert.equal(fixture.proposals.length, 1);
  assert.equal(fixture.createCalls, 0);
  assert.match(fixture.messages.at(-1)?.content ?? "", /confirm/u);
  assert.equal(fixture.appendExternalIds.at(-1), "ai-reply:message_inbound");
});

test("manual takeover is rechecked by the worker before invoking the model", async () => {
  const fixture = createFixture("manual");
  let runtimeCalls = 0;
  const handler = createAiConversationJobHandler({
    runtimeLoader: {
      async load() {
        return { async run() { runtimeCalls += 1; throw new Error("must not run"); } };
      },
    },
    loadDependencies: () => fixture.dependencies,
  });

  await handler(job());

  assert.equal(runtimeCalls, 0);
  assert.equal(fixture.messages.filter((message) => message.direction === "outbound").length, 0);
});

function job() {
  return {
    jobId: "job_1",
    tenantId: scope.tenantId,
    venueId: scope.venueId,
    kind: "conversation.process_ai",
    payload: { conversationId: "conversation_1", messageId: "message_inbound" },
    attempts: 1,
    maxAttempts: 5,
    availableAt: "2026-08-01T00:00:00.000Z",
  };
}

function createFixture(
  automationState: "automated" | "manual" = "automated",
  inboundContent = "Book a consultation",
) {
  const messages: ConversationMessageResponse[] = [{
    message_id: "message_inbound",
    conversation_id: "conversation_1",
    channel: "web_chat",
    direction: "inbound",
    sender_type: "customer",
    delivery_state: "delivered",
    content: inboundContent,
    created_at: "2026-08-01T00:00:00.000Z",
  }];
  const conversation: ConversationResponse = {
    conversation_id: "conversation_1",
    tenant_id: scope.tenantId,
    venue_id: scope.venueId,
    channel: "web_chat",
    status: "active",
    automation_state: automationState,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
  };
  const proposals: unknown[] = [];
  const appendExternalIds: Array<string | undefined> = [];
  let createCalls = 0;
  const state: ConversationBookingStateStore = {
    async save(_scope, proposal) { proposals.push(proposal); },
    async load() { return undefined; },
    async loadLatestActive() { return undefined; },
    async claim() { return undefined; },
    async release() {},
    async complete() {},
  };
  const dependencies: Omit<ConversationOrchestratorDependencies, "responder"> = {
    state,
    conversations: {
      async list() { return { data: [conversation] }; },
      async get() { return { data: conversation }; },
      async getOrCreate() { return { data: conversation }; },
      async listMessages() { return { data: [...messages].reverse() }; },
      async append(_scope, conversationId, input) {
        appendExternalIds.push(input.externalMessageId);
        const message: ConversationMessageResponse = {
          message_id: `message_${messages.length + 1}`,
          conversation_id: conversationId,
          channel: input.channel,
          direction: input.direction,
          sender_type: input.senderType,
          delivery_state: input.deliveryState ?? "sent",
          content: input.content,
          created_at: "2026-08-01T00:01:00.000Z",
        };
        messages.push(message);
        return { data: message };
      },
      async updateAutomation() { return { data: conversation }; },
    },
    async loadExperience() {
      return {
        businessName: "Luma Studio",
        knowledge: [],
        services: [{ serviceId: "service_1", name: "Consultation" }],
      };
    },
    tools: {
      async getService() { return { service_id: "service_1", name: "Consultation" }; },
      async checkAvailability() {
        return { slots: [{ start_time: "14:00", end_time: "15:00", available_quantity: 1, is_available: true }] };
      },
      async createReservation() {
        createCalls += 1;
        throw new Error("AI worker must not create reservations.");
      },
    },
    createProposalId: () => "proposal_1",
  };
  return {
    dependencies,
    proposals,
    messages,
    appendExternalIds,
    get createCalls() { return createCalls; },
  };
}
