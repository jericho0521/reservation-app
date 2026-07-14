export interface WorkerLoopOptions {
  signal: AbortSignal;
  pollIntervalMs: number;
  poll(): Promise<void>;
}

export interface WorkerRuntime {
  readonly signal: AbortSignal;
  start(): Promise<void>;
}

export function createWorkerRuntime(options: WorkerLoopOptions): WorkerRuntime {
  let running: Promise<void> | undefined;

  return {
    signal: options.signal,
    start() {
      running ??= runWorkerLoop(options);
      return running;
    },
  };
}

export async function runWorkerLoop(options: WorkerLoopOptions): Promise<void> {
  while (!options.signal.aborted) {
    await options.poll();
    if (options.signal.aborted) {
      break;
    }
    await waitForNextPoll(options.pollIntervalMs, options.signal);
  }
}

async function waitForNextPoll(intervalMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return;
  }

  await new Promise<void>((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, intervalMs);
    signal.addEventListener("abort", finish, { once: true });
  });
}
