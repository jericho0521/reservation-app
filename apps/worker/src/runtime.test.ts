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

test("job worker completes a successfully handled lease", async () => {
  const controller = new AbortController();
  const calls: unknown[] = [];
  const runtime = createWorkerRuntime({
    signal: controller.signal,
    workerId: "worker-a",
    repository: jobRepository(calls, [job()]),
    handlers: {
      "notification.email": async (claimed) => {
        calls.push(["handle", claimed.jobId]);
        controller.abort();
      },
    },
  });

  await runtime.start();
  assert.deepEqual(calls, [
    ["claim", { workerId: "worker-a", limit: 10, leaseSeconds: 30 }],
    ["handle", "job-1"],
    ["complete", "job-1", "worker-a"],
  ]);
});

test("job worker retries declared transient failures with bounded backoff", async () => {
  const controller = new AbortController();
  const calls: unknown[] = [];
  const runtime = createWorkerRuntime({
    signal: controller.signal,
    workerId: "worker-a",
    repository: jobRepository(calls, [job({ attempts: 1 })]),
    handlers: {
      "notification.email": async () => {
        controller.abort();
        const error = new Error("provider is unavailable") as Error & { code: string };
        error.code = "provider_unavailable";
        throw error;
      },
    },
    now: () => new Date("2026-07-15T00:00:00.000Z"),
  });

  await runtime.start();
  assert.deepEqual(calls.at(-1), [
    "retry",
    "job-1",
    "worker-a",
    "2026-07-15T00:00:30.000Z",
    "provider_unavailable",
  ]);
});

test("unknown kinds and exhausted retries fail terminally", async () => {
  for (const claimed of [
    job({ kind: "future.unknown" }),
    job({ attempts: 5, maxAttempts: 5 }),
  ]) {
    const controller = new AbortController();
    const calls: unknown[] = [];
    const runtime = createWorkerRuntime({
      signal: controller.signal,
      workerId: "worker-a",
      repository: jobRepository(calls, [claimed]),
      handlers: claimed.kind === "future.unknown" ? {} : {
        "notification.email": async () => {
          const error = new Error("timeout") as Error & { code: string };
          error.code = "timeout";
          throw error;
        },
      },
      afterBatch: () => controller.abort(),
    });

    await runtime.start();
    assert.deepEqual(calls.at(-1), [
      "fail",
      "job-1",
      "worker-a",
      claimed.kind === "future.unknown" ? "unsupported_job_kind" : "timeout",
    ]);
  }
});

function job(overrides: Record<string, unknown> = {}) {
  return {
    jobId: "job-1",
    tenantId: "tenant-1",
    kind: "notification.email",
    payload: {},
    attempts: 1,
    maxAttempts: 5,
    availableAt: "2026-07-15T00:00:00.000Z",
    leasedUntil: "2026-07-15T00:00:30.000Z",
    ...overrides,
  };
}

function jobRepository(calls: unknown[], claimed: ReturnType<typeof job>[]) {
  let claimCount = 0;
  return {
    async claim(input: unknown) {
      calls.push(["claim", input]);
      return claimCount++ === 0 ? claimed : [];
    },
    async complete(jobId: string, workerId: string) {
      calls.push(["complete", jobId, workerId]);
    },
    async retry(jobId: string, workerId: string, availableAt: string, errorCode: string) {
      calls.push(["retry", jobId, workerId, availableAt, errorCode]);
    },
    async fail(jobId: string, workerId: string, errorCode: string) {
      calls.push(["fail", jobId, workerId, errorCode]);
    },
  };
}
