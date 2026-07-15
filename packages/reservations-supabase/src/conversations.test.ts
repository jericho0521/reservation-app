import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createSupabaseConversationRepository } from "./conversations.js";

test("unified conversation repository enforces scope, pagination, dedup RPC, and identifier privacy", async () => {
  const source = await readFile(new URL("./conversations.ts", import.meta.url), "utf8");
  assert.match(source, /eq\("tenant_id", scope\.tenantId\)\.eq\("venue_id", scope\.venueId\)/u);
  assert.match(source, /append_platform_conversation_message/u);
  assert.match(source, /order\("created_at", \{ ascending: false \}\).*limit\(input\.limit\)/su);
  assert.match(source, /channel_identifier: input\.participant\.channelIdentifier/u);
  assert.match(source, /select\("channel_identifier"\)/u);
  const adapter = source.slice(source.indexOf("function adaptConversation"), source.indexOf("function adaptMessage"));
  assert.doesNotMatch(adapter, /channel_identifier|identifier_hash/u);
});

test("WhatsApp outbound messages use the transactional outbox RPC", async () => {
  const calls: Array<[string, Record<string, unknown> | undefined]> = [];
  const repository = createSupabaseConversationRepository({
    from() { throw new Error("WhatsApp append must not use direct table writes."); },
    async rpc(name, params) {
      calls.push([name, params]);
      return {
        data: {
          id: "message_1",
          conversation_id: "conversation_1",
          channel: "whatsapp",
          direction: "outbound",
          sender_type: "automation",
          delivery_state: "pending",
          content: "Hello",
          created_at: "2026-07-15T00:00:00.000Z",
        },
        error: null,
      };
    },
  });

  const result = await repository.appendAutomationReplyWithOutbox?.(
    { tenantId: "tenant_1", venueId: "venue_1" },
    "conversation_1",
    {
      channel: "whatsapp",
      direction: "outbound",
      senderType: "automation",
      externalMessageId: "ai-reply:message_inbound",
      content: "Hello",
    },
  );

  assert.equal(result.data?.delivery_state, "pending");
  assert.equal(calls[0]?.[0], "platform_append_whatsapp_automation_reply");
  assert.equal(calls[0]?.[1]?.p_external_message_id, "ai-reply:message_inbound");
  assert.equal("p_delivery_state" in (calls[0]?.[1] ?? {}), false);
});
