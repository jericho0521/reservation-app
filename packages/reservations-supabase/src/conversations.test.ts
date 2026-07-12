import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("unified conversation repository enforces scope, pagination, dedup RPC, and identifier privacy", async () => {
  const source = await readFile(new URL("./conversations.ts", import.meta.url), "utf8");
  assert.match(source, /eq\("tenant_id", scope\.tenantId\)\.eq\("venue_id", scope\.venueId\)/u);
  assert.match(source, /append_platform_conversation_message/u);
  assert.match(source, /order\("created_at", \{ ascending: false \}\).*limit\(input\.limit\)/su);
  assert.match(source, /channel_identifier: input\.participant\.channelIdentifier/u);
  const adapter = source.slice(source.indexOf("function adaptConversation"), source.indexOf("function adaptMessage"));
  assert.doesNotMatch(adapter, /channel_identifier|identifier_hash/u);
});
