import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("components/chat/useChat.ts", "utf8");

test("useChat delegates chat transport instead of directly fetching /api/chat", () => {
  assert.doesNotMatch(source, /fetch\(\s*['"]\/api\/chat['"]/);
  assert.match(source, /sendChatMessage/);
  assert.match(source, /confirmChatBooking/);
});

test("useChat requires confirmed result before marking booking confirmed", () => {
  assert.match(source, /actionStatus:\s*result\.confirmed\s*\?\s*'confirmed'/);
});
