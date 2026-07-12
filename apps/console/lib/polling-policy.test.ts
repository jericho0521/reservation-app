import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { nextPollingDelay } from "./polling-policy";

test("polling pauses while hidden and uses the normal visible interval", () => {
  assert.equal(nextPollingDelay({ failures: 0, hidden: true, online: true }), null);
  assert.equal(nextPollingDelay({ failures: 0, hidden: false, online: true }), 10_000);
});

test("polling backs off for failures and offline state with a bounded ceiling", () => {
  assert.equal(nextPollingDelay({ failures: 1, hidden: false, online: true }), 20_000);
  assert.equal(nextPollingDelay({ failures: 0, hidden: false, online: false }), 20_000);
  assert.equal(nextPollingDelay({ failures: 10, hidden: false, online: true }), 60_000);
});

test("live refresh only re-reads server components and cannot replay mutations", async () => {
  const source = await readFile(new URL("../components/live-status.tsx", import.meta.url), "utf8");
  assert.match(source, /router\.refresh\(\)/u);
  assert.doesNotMatch(source, /fetch\(|FormData|\.submit\(|server action/iu);
});
