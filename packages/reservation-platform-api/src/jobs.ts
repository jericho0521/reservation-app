export const PLATFORM_JOB_KINDS = [
  "notification.email",
  "whatsapp.start_session",
  "whatsapp.restore_session",
  "whatsapp.logout_session",
  "whatsapp.process_inbound",
  "whatsapp.deliver_outbound",
  "conversation.process_ai",
] as const;

export type PlatformJobKind = typeof PLATFORM_JOB_KINDS[number];

export interface PlatformJob<TPayload = Record<string, unknown>> {
  jobId: string;
  tenantId: string;
  venueId?: string;
  kind: PlatformJobKind;
  payload: TPayload;
  attempts: number;
  maxAttempts: number;
  availableAt: string;
  leasedUntil?: string;
}

export interface EnqueuePlatformJobInput<TPayload = Record<string, unknown>> {
  tenantId: string;
  venueId?: string;
  kind: PlatformJobKind;
  payload: TPayload;
  maxAttempts: number;
  availableAt?: string;
  idempotencyKey: string;
}

export interface PlatformJobRepository {
  enqueue(input: EnqueuePlatformJobInput): Promise<{ jobId: string }>;
  claim(input: { workerId: string; limit: number; leaseSeconds: number }): Promise<readonly PlatformJob[]>;
  complete(jobId: string, workerId: string): Promise<void>;
  retry(jobId: string, workerId: string, availableAt: string, errorCode: string): Promise<void>;
  fail(jobId: string, workerId: string, errorCode: string): Promise<void>;
}

export type PlatformJobHandler = (job: PlatformJob) => Promise<void>;

const transientErrorCodes = new Set([
  "network_error",
  "provider_timeout",
  "provider_unavailable",
  "rate_limited",
  "timeout",
]);

export class PlatformJobProcessingError extends Error {
  readonly code: string;

  constructor(code: string, message = "Platform job processing failed.") {
    super(message);
    this.name = "PlatformJobProcessingError";
    this.code = safeErrorCode(code);
  }
}

export function nextRetryAt(now: Date, attempts: number): string {
  const seconds = Math.min(3600, 2 ** Math.max(0, attempts) * 15);
  return new Date(now.getTime() + seconds * 1000).toISOString();
}

export function classifyPlatformJobError(error: unknown): { code: string; transient: boolean } {
  const code = error && typeof error === "object" && "code" in error
    ? safeErrorCode((error as { code?: unknown }).code)
    : "job_handler_failed";
  return { code, transient: transientErrorCodes.has(code) };
}

export function isPlatformJobKind(value: unknown): value is PlatformJobKind {
  return typeof value === "string" && (PLATFORM_JOB_KINDS as readonly string[]).includes(value);
}

function safeErrorCode(value: unknown) {
  return typeof value === "string" && /^[a-z0-9][a-z0-9_.-]{0,99}$/u.test(value)
    ? value
    : "job_handler_failed";
}
