import assert from "node:assert/strict";
import test from "node:test";
import { ChatWidget } from "./chat/chat-widget.js";

function text(node: unknown): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!node || typeof node !== "object") return "";
  const children = (node as { props?: { children?: unknown } }).props?.children;
  return (Array.isArray(children) ? children : [children]).map(text).join("");
}

test("chat widget renders proposal confirmation, retry, typing, and handoff states", () => {
  const base = { brandName: "Apex", messages: [], draft: "", onDraftChange() {}, onSend() {}, onConfirm() {}, onRetry() {} };
  const proposal = ChatWidget({ ...base, proposal: { proposal_id: "p1", service_id: "s1", service_name: "Sprint", staff_id: "11111111-1111-4111-8111-111111111111", practitioner_name: "Alex", date: "2026-08-10", start_time: "14:00", end_time: "15:00", quantity: 1 } });
  assert.match(text(proposal), /Booking assistant available.*Ready for confirmation.*PractitionerAlex.*Confirm booking.*No reservation is created/u);
  const loading = ChatWidget({ ...base, loading: true });
  assert.match(text(loading), /Assistant is checking/u);
  const failed = ChatWidget({ ...base, error: "Offline", canRetry: true });
  assert.match(text(failed), /OfflineRetry/u);
  const handoff = ChatWidget({ ...base, handoff: true });
  assert.match(text(handoff), /Staff joined.*Automated replies are paused/u);
  const cited = ChatWidget({
    ...base,
    messages: [{
      message_id: "message-1",
      conversation_id: "conversation-1",
      sender_type: "automation",
      direction: "outbound",
      content: "Cancel at least 24 hours before.",
      delivery_state: "delivered",
      created_at: "2026-07-21T00:00:00.000Z",
      sources: [{ source_id: "00000000-0000-4000-8000-000000000001", label: "Cancellation policy" }],
    }],
  });
  assert.match(text(cited), /Cancel at least 24 hours before.*Cancellation policy/u);
});
