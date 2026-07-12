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

test("business module can answer from any active business knowledge", async () => {
  const module = new WhatsAppBusinessModule({ enabled: true });
  await module.updateConfig({
    business_name: "Racing Sim",
  });
  await module.createKnowledge({
    title: "Opening hours",
    content: "We open at 9 AM.",
  });

  const response = await module.handleInboundMessage({
    provider: "session_qr",
    messageId: "wamid_3",
    from: { id: "60123456789@s.whatsapp.net", phoneNumber: "60123456789" },
    text: "What are your opening hours?",
  });

  assert.match(response.content, /We open at 9 AM/u);
});

test("manual takeover keeps conversation manual until explicit resume", async () => {
  const sent: string[] = [];
  const module = new WhatsAppBusinessModule({
    enabled: true,
    sessionAdapter: {
      async sendMessage(input) {
        sent.push(input.text);
      },
    },
  });
  await module.createKnowledge({
    title: "Opening hours",
    content: "We open at 9 AM.",
  });

  const first = await module.handleInboundMessage({
    provider: "session_qr",
    messageId: "wamid_4",
    from: { id: "60123456789@s.whatsapp.net" },
    text: "What are your opening hours?",
  });
  const [conversation] = await module.listConversations();
  await module.updateConversationAutomationStatus({
    conversation_id: conversation.conversation_id,
    automation_status: "manual",
    changed_by: "staff_1",
  });
  const manual = await module.handleInboundMessage({
    provider: "session_qr",
    messageId: "wamid_5",
    from: { id: "60123456789@s.whatsapp.net" },
    text: "Are you there?",
  });
  await module.updateConversationAutomationStatus({
    conversation_id: conversation.conversation_id,
    automation_status: "automated",
    changed_by: "staff_1",
  });
  const resumed = await module.handleInboundMessage({
    provider: "session_qr",
    messageId: "wamid_6",
    from: { id: "60123456789@s.whatsapp.net" },
    text: "Opening hours again?",
  });

  assert.match(first.content, /We open at 9 AM/u);
  assert.equal(manual.content, "");
  assert.equal(manual.metadata?.responder, "manual_handoff");
  assert.match(resumed.content, /We open at 9 AM/u);
  assert.deepEqual(sent, [
    "Reservation Business: We open at 9 AM.",
    "Reservation Business: We open at 9 AM.",
  ]);
});

test("manual takeover suppresses unsupported inbound fallback replies", async () => {
  const sent: string[] = [];
  const module = new WhatsAppBusinessModule({
    enabled: true,
    sessionAdapter: {
      async sendMessage(input) {
        sent.push(input.text);
      },
    },
  });
  await module.handleInboundMessage({
    provider: "session_qr",
    messageId: "wamid_7",
    from: { id: "60123456789@s.whatsapp.net" },
    text: "hello",
  });
  const [conversation] = await module.listConversations();
  await module.updateConversationAutomationStatus({
    conversation_id: conversation.conversation_id,
    automation_status: "manual",
    changed_by: "staff_1",
  });

  const response = await module.handleInboundMessage({
    provider: "session_qr",
    messageId: "wamid_8",
    from: { id: "60123456789@s.whatsapp.net" },
  });

  assert.equal(response.content, "");
  assert.equal(response.metadata?.responder, "manual_handoff");
  assert.deepEqual(sent, ["Reservation Business: Please wait while staff checks this for you."]);
});

test("staff replies send outbound and switch conversation to manual", async () => {
  const sent: Array<{ to: string; text: string }> = [];
  const module = new WhatsAppBusinessModule({
    enabled: true,
    sessionAdapter: {
      async sendMessage(input) {
        sent.push({ to: input.to, text: input.text });
      },
    },
  });
  await module.handleInboundMessage({
    provider: "session_qr",
    messageId: "wamid_9",
    from: { id: "60123456789@s.whatsapp.net" },
    text: "hello",
  });
  const [conversation] = await module.listConversations();

  const reply = await module.sendConversationMessage({
    conversation_id: conversation.conversation_id,
    text: "A staff member will help you now.",
    changed_by: "staff_2",
  });
  const messages = await module.listConversationMessages(conversation.conversation_id);
  const afterStaffReply = await module.handleInboundMessage({
    provider: "session_qr",
    messageId: "wamid_10",
    from: { id: "60123456789@s.whatsapp.net" },
    text: "thanks",
  });

  assert.equal(reply?.content, "A staff member will help you now.");
  assert.equal(afterStaffReply.content, "");
  assert.equal(messages.at(-1)?.metadata?.system_event, "automation_takeover");
  assert.deepEqual(sent.at(-1), {
    to: "60123456789@s.whatsapp.net",
    text: "A staff member will help you now.",
  });
});

test("unified conversation bridge owns inbound persistence, replies, and takeover suppression", async () => {
  const bridged: string[] = [];
  const sent: string[] = [];
  let manual = false;
  const module = new WhatsAppBusinessModule({
    enabled: true,
    unifiedConversations: {
      async handleInbound(input) {
        bridged.push(input.messageId);
        return { conversation_id: "unified_1", content: manual ? "" : "Unified reply", automation_suppressed: manual };
      },
    },
    sessionAdapter: { async sendMessage(input) { sent.push(input.text); } },
  });
  const message = { provider: "session_qr" as const, messageId: "wamid_unified_1", from: { id: "60123@s.whatsapp.net" }, text: "hello" };
  const automated = await module.handleInboundMessage(message);
  manual = true;
  const suppressed = await module.handleInboundMessage({ ...message, messageId: "wamid_unified_2", text: undefined });
  assert.equal(automated.conversation_id, "unified_1");
  assert.equal(suppressed.automation_suppressed, true);
  assert.deepEqual(bridged, ["wamid_unified_1", "wamid_unified_2"]);
  assert.deepEqual(sent, ["Unified reply"]);
});

test("simulated unified messages never use the live outbound sender", async () => {
  let sent = false;
  const module = new WhatsAppBusinessModule({
    enabled: true,
    sessionAdapter: { async sendMessage() { sent = true; } },
    unifiedConversations: { async handleInbound() { return { conversation_id: "simulation_1", content: "Demo reply" }; } },
  });
  const result = await module.handleInboundMessage({
    provider: "session_qr",
    messageId: "sim_1",
    from: { id: "demo@s.whatsapp.net" },
    text: "Hello",
    raw: { simulated: true },
  });
  assert.equal(result.content, "Demo reply");
  assert.equal(sent, false);
});
