import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { conversationChannelLabel, conversationPreview, groupConversationTimeline } from "./conversation-view";

test("conversation view labels channels, hides identifiers, and groups chronological messages", () => {
  assert.equal(conversationChannelLabel("whatsapp"), "WhatsApp");
  assert.equal(conversationPreview({ conversation_id: "c1", tenant_id: "t1", venue_id: "v1", channel: "whatsapp", status: "active", automation_state: "manual", participant: { participant_id: "p1", role: "customer", contact_hint: "***1234" }, created_at: "now", updated_at: "now" }), "***1234");
  assert.equal(groupConversationTimeline([
    { message_id: "m1", conversation_id: "c1", channel: "web_chat", direction: "inbound", sender_type: "customer", delivery_state: "delivered", content: "Hi", created_at: "2026-08-01T10:00:00Z" },
    { message_id: "m2", conversation_id: "c1", channel: "web_chat", direction: "outbound", sender_type: "staff", delivery_state: "sent", content: "Hello", created_at: "2026-08-01T10:01:00Z" },
  ]).length, 1);
});

test("staff reply action calls the direct conversation SDK operation without AI generation", async () => {
  const source = await readFile(new URL("../app/conversations/actions.ts", import.meta.url), "utf8");
  assert.match(source, /sendConversationStaffReply/u);
  assert.doesNotMatch(source, /ai-chat|model_provider|generate\(/u);
});
