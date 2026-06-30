import assert from "node:assert/strict";
import test from "node:test";

import { WhatsAppBusinessModule } from "./module.js";

test("business module answers inbound text from active knowledge and audits messages", async () => {
  const sent: Array<{ to: string; text: string }> = [];
  const module = new WhatsAppBusinessModule({
    enabled: true,
    sessionAdapter: {
      async start() {
        return { qr_code: "qr" };
      },
      async logout() {
        return undefined;
      },
      async sendMessage(input) {
        sent.push({ to: input.to, text: input.text });
      },
    },
    now: () => new Date("2026-06-30T00:00:00.000Z"),
  });

  await module.updateConfig({ business_name: "CH Room Booking" });
  await module.createKnowledge({
    title: "Opening hours",
    content: "We are open Monday to Friday, 9 AM to 6 PM.",
    tags: ["hours"],
  });
  const response = await module.handleInboundMessage({
    provider: "session_qr",
    messageId: "wamid_1",
    from: { id: "60123456789@s.whatsapp.net", phoneNumber: "60123456789" },
    text: "What are your Opening hours?",
  });

  assert.equal(response.content, "CH Room Booking: We are open Monday to Friday, 9 AM to 6 PM.");
  assert.deepEqual(sent, [{
    to: "60123456789@s.whatsapp.net",
    text: "CH Room Booking: We are open Monday to Friday, 9 AM to 6 PM.",
  }]);

  const conversations = await module.listConversations();
  assert.equal(conversations.length, 1);
  const messages = await module.listConversationMessages(conversations[0].conversation_id);
  assert.equal(messages.length, 2);
  assert.equal(messages[0].direction, "inbound");
  assert.equal(messages[1].direction, "outbound");
});

test("business module returns fallback for unsupported inbound messages", async () => {
  const sent: string[] = [];
  const module = new WhatsAppBusinessModule({
    enabled: true,
    sessionAdapter: {
      async start() {
        return { qr_code: "qr" };
      },
      async logout() {
        return undefined;
      },
      async sendMessage(input) {
        sent.push(input.text);
      },
    },
  });

  const response = await module.handleInboundMessage({
    provider: "session_qr",
    messageId: "wamid_2",
    from: { id: "60123456789@s.whatsapp.net" },
  });

  assert.equal(response.content, "Please wait while staff checks this for you.");
  assert.deepEqual(sent, ["Please wait while staff checks this for you."]);
});
