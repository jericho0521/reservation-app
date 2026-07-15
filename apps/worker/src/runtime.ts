import { classifyPlatformJobError, nextRetryAt } from "@reservation-platform/api";

export interface WorkerLoopOptions {
  signal: AbortSignal;
  pollIntervalMs: number;
  poll(): Promise<void>;
}

export interface WorkerRuntime {
  readonly signal: AbortSignal;
  start(): Promise<void>;
}

export interface WorkerPlatformJob {
  jobId: string;
  tenantId: string;
  venueId?: string;
  kind: string;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
  availableAt: string;
  leasedUntil?: string;
}

export interface WorkerJobRepository {
  claim(input: {
    workerId: string;
    limit: number;
    leaseSeconds: number;
  }): Promise<readonly WorkerPlatformJob[]>;
  complete(jobId: string, workerId: string): Promise<void>;
  retry(jobId: string, workerId: string, availableAt: string, errorCode: string): Promise<void>;
  fail(jobId: string, workerId: string, errorCode: string): Promise<void>;
}

export type PlatformJobHandler = (job: WorkerPlatformJob) => Promise<void>;

export interface JobWorkerOptions {
  signal: AbortSignal;
  repository: WorkerJobRepository;
  handlers: Readonly<Record<string, PlatformJobHandler | undefined>>;
  workerId: string;
  pollIntervalMs?: number;
  claimLimit?: number;
  leaseSeconds?: number;
  now?: () => Date;
  afterBatch?: () => void;
}

export function createWorkerRuntime(options: WorkerLoopOptions): WorkerRuntime;
export function createWorkerRuntime(options: JobWorkerOptions): WorkerRuntime;
export function createWorkerRuntime(options: WorkerLoopOptions | JobWorkerOptions): WorkerRuntime {
  const loopOptions = "repository" in options
    ? createJobLoopOptions(options)
    : options;
  let running: Promise<void> | undefined;

  return {
    signal: options.signal,
    start() {
      running ??= runWorkerLoop(loopOptions);
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

function createJobLoopOptions(options: JobWorkerOptions): WorkerLoopOptions {
  const claimLimit = options.claimLimit ?? 10;
  const leaseSeconds = options.leaseSeconds ?? 30;
  const now = options.now ?? (() => new Date());

  return {
    signal: options.signal,
    pollIntervalMs: options.pollIntervalMs ?? 1_000,
    async poll() {
      const jobs = await options.repository.claim({
        workerId: options.workerId,
        limit: claimLimit,
        leaseSeconds,
      });
      for (const job of jobs) {
        await dispatchJob(options, job, now);
      }
      options.afterBatch?.();
    },
  };
}

async function dispatchJob(
  options: JobWorkerOptions,
  job: WorkerPlatformJob,
  now: () => Date,
): Promise<void> {
  const handler = options.handlers[job.kind];
  if (!handler) {
    await options.repository.fail(job.jobId, options.workerId, "unsupported_job_kind");
    return;
  }

  try {
    await handler(job);
    await options.repository.complete(job.jobId, options.workerId);
  } catch (error) {
    const failure = classifyPlatformJobError(error);
    if (failure.transient && job.attempts < job.maxAttempts) {
      await options.repository.retry(
        job.jobId,
        options.workerId,
        nextRetryAt(now(), job.attempts),
        failure.code,
      );
      return;
    }
    await options.repository.fail(job.jobId, options.workerId, failure.code);
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
