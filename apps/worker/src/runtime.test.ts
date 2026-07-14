import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import test from "node:test";

import { createWorkerRuntime, runWorkerLoop } from "./runtime.js";

test("worker loop stops after abort without another poll", async () => {
  const controller = new AbortController();
  let polls = 0;

  const run = runWorkerLoop({
    signal: controller.signal,
    pollIntervalMs: 1,
    poll: async () => {
      polls += 1;
      controller.abort();
    },
  });

  await run;

  assert.equal(polls, 1);
});

test("worker loop aborts during sleep and removes its abort listener", async () => {
  const controller = new AbortController();
  let polls = 0;

  const run = runWorkerLoop({
    signal: controller.signal,
    pollIntervalMs: 60_000,
    poll: async () => {
      polls += 1;
    },
  });

  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(getEventListeners(controller.signal, "abort").length, 1);

  controller.abort();
  await run;

  assert.equal(polls, 1);
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
});

test("worker loop propagates an unexpected poll failure", async () => {
  const failure = new Error("poll failed");

  await assert.rejects(
    runWorkerLoop({
      signal: new AbortController().signal,
      pollIntervalMs: 1,
      poll: async () => {
        throw failure;
      },
    }),
    failure,
  );
});

test("worker runtime starts its loop only once", async () => {
  const controller = new AbortController();
  let polls = 0;
  const runtime = createWorkerRuntime({
    signal: controller.signal,
    pollIntervalMs: 1,
    poll: async () => {
      polls += 1;
      controller.abort();
    },
  });

  const firstRun = runtime.start();
  const secondRun = runtime.start();

  assert.equal(secondRun, firstRun);
  await Promise.all([firstRun, secondRun]);
  assert.equal(polls, 1);
});
