import assert from "node:assert/strict";
import test from "node:test";
import { getOrCreatePublicChatThread, publicChatStorageKeys, reducePublicChat, type PublicChatState } from "./chat.js";

const initial: PublicChatState = { threadId: "thread_1", messages: [], loading: false, restoring: false, handoff: false };

test("public chat reducer tracks proposal, handoff, errors, and reservation", () => {
  const proposed = reducePublicChat(initial, { type: "response_received", response: {
    conversation_id: "conversation_1", automation_state: "automated",
    proposal: { proposal_id: "proposal_1", service_id: "service_1", service_name: "Sprint", date: "2026-08-10", start_time: "14:00", end_time: "15:00", quantity: 1 },
  } });
  assert.equal(proposed.proposal?.proposal_id, "proposal_1");
  const handoff = reducePublicChat(proposed, { type: "response_received", response: { conversation_id: "conversation_1", automation_state: "manual", automation_suppressed: true } });
  assert.equal(handoff.handoff, true);
  const failed = reducePublicChat(handoff, { type: "request_failed", message: "Offline", failedMessage: "Hello" });
  assert.equal(failed.failedMessage, "Hello");
});

test("public chat storage uses slug isolation and restores an existing thread", () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  assert.notDeepEqual(publicChatStorageKeys("venue-a"), publicChatStorageKeys("venue-b"));
  assert.equal(getOrCreatePublicChatThread(storage, "venue-a", () => "thread_created"), "thread_created");
  assert.equal(getOrCreatePublicChatThread(storage, "venue-a", () => "unused"), "thread_created");
});
