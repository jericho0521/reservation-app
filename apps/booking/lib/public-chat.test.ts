import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { ReservationPlatformClient } from "@reservation-platform/sdk";
import { createDurablePublicChatClient } from "./public-chat.js";

test("public chat route requires published channel enablement and uses browser-safe packages", async () => {
  const route = await readFile(new URL("../app/[slug]/chat/page.tsx", import.meta.url), "utf8");
  const component = await readFile(new URL("../components/public-chat.tsx", import.meta.url), "utf8");
  assert.match(route, /configuration\.channels\.web_chat/u);
  assert.match(component, /usePublicChat/u);
  assert.doesNotMatch(component, /supabase|service.role|RESERVATION_SUPABASE/ui);
});

test("durable public chat polls with bounded backoff until the assistant reply is persisted", async () => {
  const calls: string[] = [];
  const delays: number[] = [];
  let reads = 0;
  const client = createDurablePublicChatClient({
    async sendPublicChatMessage() {
      calls.push("send");
      return {
        conversation_id: "conversation_1",
        automation_state: "automated",
        message: message("inbound", "customer", "message_inbound", "2026-08-01T00:00:00.000Z"),
      };
    },
    async listPublicChatMessages() {
      calls.push("poll");
      reads += 1;
      return {
        messages: reads === 1
          ? [message("inbound", "customer", "message_inbound", "2026-08-01T00:00:00.000Z")]
          : [
              message("outbound", "automation", "message_reply", "2026-08-01T00:00:01.000Z"),
              message("inbound", "customer", "message_inbound", "2026-08-01T00:00:00.000Z"),
            ],
        ...(reads === 1 ? {} : { proposal: {
          proposal_id: "proposal_1", service_id: "service_1", service_name: "Consultation",
          date: "2026-08-10", start_time: "09:00", end_time: "09:30", quantity: 1,
        } }),
      };
    },
    async confirmPublicChatBooking() { throw new Error("not used"); },
  } as Pick<ReservationPlatformClient, "sendPublicChatMessage" | "listPublicChatMessages" | "confirmPublicChatBooking">, {
    delaysMs: [10, 20, 40],
    async sleep(milliseconds) { delays.push(milliseconds); },
  });

  const response = await client.sendPublicChatMessage("luma-studio", {
    thread_id: "thread_123",
    content: "Hello",
  });

  assert.equal(response.message?.message_id, "message_reply");
  assert.equal(response.proposal?.proposal_id, "proposal_1");
  assert.deepEqual(calls, ["send", "poll", "poll"]);
  assert.deepEqual(delays, [10, 20]);
});

test("manual takeover returns immediately without starting an AI polling loop", async () => {
  let reads = 0;
  const client = createDurablePublicChatClient({
    async sendPublicChatMessage() {
      return {
        conversation_id: "conversation_1",
        automation_state: "manual",
        automation_suppressed: true,
        message: message("inbound", "customer", "message_inbound", "2026-08-01T00:00:00.000Z"),
      };
    },
    async listPublicChatMessages() { reads += 1; return { messages: [] }; },
    async confirmPublicChatBooking() { throw new Error("not used"); },
  } as Pick<ReservationPlatformClient, "sendPublicChatMessage" | "listPublicChatMessages" | "confirmPublicChatBooking">);

  const response = await client.sendPublicChatMessage("luma-studio", {
    thread_id: "thread_123",
    content: "Hello",
  });
  assert.equal(response.automation_suppressed, true);
  assert.equal(reads, 0);
});

function message(
  direction: "inbound" | "outbound",
  senderType: "customer" | "automation",
  messageId: string,
  createdAt: string,
) {
  return {
    message_id: messageId,
    conversation_id: "conversation_1",
    channel: "web_chat" as const,
    direction,
    sender_type: senderType,
    delivery_state: direction === "inbound" ? "delivered" as const : "sent" as const,
    content: direction === "inbound" ? "Hello" : "How can I help?",
    created_at: createdAt,
  };
}
