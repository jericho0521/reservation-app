import assert from "node:assert/strict";
import test from "node:test";
import {
  appendConversationMessage,
  appendStaffReply,
  listConversationMessages,
  listConversations,
  updateConversationAutomation,
  type ConversationRepository,
} from "./conversations.js";

const scope = { tenantId: "tenant_1", venueId: "venue_1" };

test("conversation listing preserves tenant/venue and channel filters", async () => {
  let received: unknown;
  const result = await listConversations({
    scope,
    query: { channel: "whatsapp", limit: 20 },
    repository: repository({ list: async (nextScope, query) => { received = { scope: nextScope, query }; return { data: [] }; } }),
  });
  assert.equal(result.status, 200);
  assert.deepEqual(received, { scope, query: { channel: "whatsapp", limit: 20 } });
});

test("message append returns the repository-deduplicated channel message", async () => {
  const message = messageFixture();
  let appends = 0;
  const repo = repository({ append: async () => { appends += 1; return { data: message }; } });
  const first = await appendConversationMessage({ scope, conversationId: "conversation_1", value: { channel: "whatsapp", direction: "inbound", senderType: "customer", externalMessageId: "wamid.1", content: "Book a slot" }, repository: repo });
  const second = await appendConversationMessage({ scope, conversationId: "conversation_1", value: { channel: "whatsapp", direction: "inbound", senderType: "customer", externalMessageId: "wamid.1", content: "Book a slot" }, repository: repo });
  assert.deepEqual(first, second);
  assert.equal(appends, 2);
});

test("message pagination returns chronological pages with an older cursor", async () => {
  const result = await listConversationMessages({
    scope,
    conversationId: "conversation_1",
    query: { limit: 2 },
    repository: repository({ listMessages: async () => ({ data: [messageFixture({ message_id: "new", created_at: "2026-07-12T10:01:00Z" }), messageFixture({ message_id: "old", created_at: "2026-07-12T10:00:00Z" })] }) }),
  });
  assert.deepEqual("messages" in result.body && result.body.messages.map((message) => message.message_id), ["old", "new"]);
  assert.equal("next_cursor" in result.body && result.body.next_cursor, "2026-07-12T10:00:00Z");
});

test("manual takeover state is delegated authoritatively within scope", async () => {
  let received: unknown;
  const result = await updateConversationAutomation({
    scope,
    conversationId: "conversation_1",
    value: { automation_state: "manual" },
    changedBy: "staff_1",
    repository: repository({ updateAutomation: async (nextScope, id, value) => { received = { scope: nextScope, id, value }; return { data: conversationFixture({ automation_state: "manual" }) }; } }),
  });
  assert.equal("automation_state" in result.body && result.body.automation_state, "manual");
  assert.deepEqual(received, { scope, id: "conversation_1", value: { automation_state: "manual", changedBy: "staff_1" } });
});

test("staff replies pause automation before direct delivery and persistence", async () => {
  const order: string[] = [];
  const repo = repository({
    updateAutomation: async () => { order.push("takeover"); return { data: conversationFixture({ automation_state: "manual" }) }; },
    append: async () => { order.push("persist"); return { data: messageFixture({ direction: "outbound", sender_type: "staff" }) }; },
  });
  const result = await appendStaffReply({
    scope,
    conversationId: "conversation_1",
    value: { content: "A staff reply" },
    repository: repo,
    deliver: async () => { order.push("deliver"); },
  });
  assert.equal(result.status, 200);
  assert.deepEqual(order, ["takeover", "deliver", "persist"]);
});

function repository(overrides: Partial<ConversationRepository>): ConversationRepository {
  return {
    list: async () => ({ data: [] }),
    get: async () => ({ data: conversationFixture() }),
    getOrCreate: async () => ({ data: conversationFixture() }),
    listMessages: async () => ({ data: [] }),
    append: async () => ({ data: messageFixture() }),
    updateAutomation: async () => ({ data: conversationFixture() }),
    ...overrides,
  };
}

function conversationFixture(overrides: Record<string, unknown> = {}) {
  return {
    conversation_id: "conversation_1", tenant_id: "tenant_1", venue_id: "venue_1",
    channel: "whatsapp" as const, status: "active" as const, automation_state: "automated" as const,
    created_at: "2026-07-12T10:00:00Z", updated_at: "2026-07-12T10:00:00Z", ...overrides,
  };
}
function messageFixture(overrides: Record<string, unknown> = {}) {
  return {
    message_id: "message_1", conversation_id: "conversation_1", channel: "whatsapp" as const,
    direction: "inbound" as const, sender_type: "customer" as const, delivery_state: "delivered" as const,
    content: "Book a slot", created_at: "2026-07-12T10:00:00Z", ...overrides,
  };
}
