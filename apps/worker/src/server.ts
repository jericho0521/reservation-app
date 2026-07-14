import { fileURLToPath } from "node:url";

import { createWorkerRuntime } from "./runtime.js";

const pollIntervalMs = 1_000;

if (isDirectRun()) {
  void runDirectWorker();
}

async function runDirectWorker(): Promise<void> {
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);

  logLifecycleEvent("worker_started");

  try {
    const runtime = createWorkerRuntime({
      signal: controller.signal,
      pollIntervalMs,
      poll: async () => {},
    });
    await runtime.start();
    logLifecycleEvent("worker_stopped");
  } catch {
    process.exitCode = 1;
    logLifecycleEvent("worker_failed");
  } finally {
    process.removeListener("SIGTERM", stop);
    process.removeListener("SIGINT", stop);
  }
}

function logLifecycleEvent(event: "worker_started" | "worker_stopped" | "worker_failed"): void {
  console.log(JSON.stringify({ event }));
}

function isDirectRun(): boolean {
  return process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
}
