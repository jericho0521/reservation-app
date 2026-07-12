import assert from "node:assert/strict";
import test from "node:test";
import { createAgentConversationResponder, createDeterministicConversationResponder } from "./conversation-responders.js";

const input = {
  scope: { tenantId: "tenant_1", venueId: "venue_1" },
  conversation: {
    conversation_id: "conversation_1", tenant_id: "tenant_1", venue_id: "venue_1", channel: "web_chat" as const,
    status: "active" as const, automation_state: "automated" as const, created_at: "now", updated_at: "now",
  },
  message: "Book Simulator Session on 2026-08-10 at 14:00 for 2; Alex; alex@example.com; +60123",
  experience: {
    businessName: "Apex Racing",
    services: [{ serviceId: "service_1", name: "Simulator Session" }],
    knowledge: [{ question: "Where can I park?", answer: "Use the north entrance." }],
  },
};

test("deterministic responder creates a proposal only for exact configured services", async () => {
  const responder = createDeterministicConversationResponder();
  const result = await responder.respond(input);
  assert.equal(result.booking?.service_id, "service_1");
  assert.equal((await responder.respond({ ...input, message: input.message.replace("Simulator Session", "Invented Service") })).booking, undefined);
});

test("deterministic responder answers configured knowledge without external services", async () => {
  const result = await createDeterministicConversationResponder().respond({ ...input, message: "Where can I park?" });
  assert.equal(result.content, "Use the north entrance.");
});

test("agent responder accepts structured proposals and falls back deterministically on failure", async () => {
  const responder = createAgentConversationResponder({
    async run() { return { message: { content: "Please confirm." }, data: { reply: "Please confirm.", supported: true, booking: {
      service_id: "service_1", service_name: "Simulator Session", date: "2026-08-10", start_time: "14:00", seats: 2,
      user_name: "Alex", user_email: "alex@example.com", user_phone: "+60123",
    } } }; },
  });
  assert.equal((await responder.respond(input)).booking?.service_id, "service_1");
  const fallback = createAgentConversationResponder({ async run() { throw new Error("offline"); } });
  assert.equal((await fallback.respond(input)).booking?.service_id, "service_1");
});
