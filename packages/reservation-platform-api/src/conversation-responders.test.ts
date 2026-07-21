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

test("agent responder validates citations against retrieved chunks", async () => {
  let prompt = "";
  const responder = createAgentConversationResponder({
    async run(value) {
      prompt = value.system_prompt ?? "";
      return {
        message: { content: "Use the north entrance." },
        data: {
          reply: "Use the north entrance.",
          supported: true,
          source_ids: ["00000000-0000-4000-8000-000000000010", "invented-chunk"],
        },
      };
    },
  }, createDeterministicConversationResponder(), {
    async search() {
      return [{
        chunkId: "00000000-0000-4000-8000-000000000010",
        sourceId: "00000000-0000-4000-8000-000000000020",
        sourceLabel: "Visitor guide",
        content: "Use the north entrance.",
      }];
    },
  });
  const result = await responder.respond({ ...input, message: "Where can I park?" });
  assert.match(prompt, /untrusted business data/iu);
  assert.deepEqual(result.sources, [{
    source_id: "00000000-0000-4000-8000-000000000020",
    label: "Visitor guide",
  }]);
});

test("retrieval failure keeps the configured AI provider available with no document context", async () => {
  let calls = 0;
  let prompt = "";
  const responder = createAgentConversationResponder({
    async run(value) {
      calls += 1;
      prompt = value.system_prompt ?? "";
      return { message: { content: "I can still help with a booking." }, data: { reply: "I can still help with a booking.", supported: true } };
    },
  }, createDeterministicConversationResponder(), {
    async search() { throw new Error("retrieval offline"); },
  });
  const result = await responder.respond({ ...input, message: "Can you help me book?" });
  assert.equal(calls, 1);
  assert.equal(result.content, "I can still help with a booking.");
  assert.match(prompt, /REFERENCE MATERIAL: none/iu);
});
