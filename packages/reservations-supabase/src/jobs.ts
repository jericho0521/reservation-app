import {
  isPlatformJobKind,
  type EnqueuePlatformJobInput,
  type PlatformJob,
  type PlatformJobRepository,
} from "@reservation-platform/api";

type RpcResult = { data: unknown; error: unknown | null };

export interface PlatformJobsSupabaseClient {
  rpc(name: string, params?: Record<string, unknown>): Promise<RpcResult>;
}

export const RESERVATION_SUPABASE_JOB_RPCS = {
  enqueue: "enqueue_platform_job",
  claim: "claim_platform_jobs",
  complete: "complete_platform_job",
  retry: "retry_platform_job",
  fail: "fail_platform_job",
} as const;

export function createSupabasePlatformJobRepository(
  client: PlatformJobsSupabaseClient,
): PlatformJobRepository {
  return {
    async enqueue(input: EnqueuePlatformJobInput) {
      const result = await client.rpc(RESERVATION_SUPABASE_JOB_RPCS.enqueue, {
        p_tenant_id: input.tenantId,
        p_venue_id: input.venueId ?? null,
        p_kind: input.kind,
        p_payload: input.payload,
        p_max_attempts: input.maxAttempts,
        p_available_at: input.availableAt ?? null,
        p_idempotency_key: input.idempotencyKey,
      });
      assertSucceeded(result, "Failed to enqueue platform job.");
      const row = firstRecord(result.data);
      return { jobId: requireString(row?.job_id, "job id") };
    },

    async claim(input) {
      const result = await client.rpc(RESERVATION_SUPABASE_JOB_RPCS.claim, {
        p_worker_id: input.workerId,
        p_limit: input.limit,
        p_lease_seconds: input.leaseSeconds,
      });
      assertSucceeded(result, "Failed to claim platform jobs.");
      if (!Array.isArray(result.data)) {
        throw new Error("Supabase returned an invalid platform job claim response.");
      }
      return result.data.map(adaptPlatformJob);
    },

    async complete(jobId, workerId) {
      await transition(client, RESERVATION_SUPABASE_JOB_RPCS.complete, {
        p_job_id: jobId,
        p_worker_id: workerId,
      });
    },

    async retry(jobId, workerId, availableAt, errorCode) {
      await transition(client, RESERVATION_SUPABASE_JOB_RPCS.retry, {
        p_job_id: jobId,
        p_worker_id: workerId,
        p_available_at: availableAt,
        p_error_code: errorCode,
      });
    },

    async fail(jobId, workerId, errorCode) {
      await transition(client, RESERVATION_SUPABASE_JOB_RPCS.fail, {
        p_job_id: jobId,
        p_worker_id: workerId,
        p_error_code: errorCode,
      });
    },
  };
}

async function transition(
  client: PlatformJobsSupabaseClient,
  rpc: string,
  params: Record<string, unknown>,
) {
  const result = await client.rpc(rpc, params);
  assertSucceeded(result, "Failed to transition platform job.");
  if (result.data !== true) {
    throw new Error("Platform job lease is no longer owned by this worker.");
  }
}

function adaptPlatformJob(value: unknown): PlatformJob {
  const row = asRecord(value, "platform job");
  const kind = row.kind;
  if (!isPlatformJobKind(kind)) {
    throw new Error("Supabase returned an invalid job kind.");
  }
  const payload = asRecord(row.payload, "job payload");
  return {
    jobId: requireString(row.job_id, "job id"),
    tenantId: requireString(row.tenant_id, "job tenant id"),
    ...(optionalString(row.venue_id) ? { venueId: optionalString(row.venue_id)! } : {}),
    kind,
    payload,
    attempts: requireInteger(row.attempts, "job attempts"),
    maxAttempts: requireInteger(row.max_attempts, "job max attempts"),
    availableAt: requireString(row.available_at, "job available time"),
    ...(optionalString(row.leased_until) ? { leasedUntil: optionalString(row.leased_until)! } : {}),
  };
}

function firstRecord(value: unknown) {
  const row = Array.isArray(value) ? value[0] : value;
  return row === undefined || row === null ? null : asRecord(row, "enqueue response");
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Supabase returned an invalid ${label}.`);
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, label: string) {
  const string = optionalString(value);
  if (!string) throw new Error(`Supabase returned an invalid ${label}.`);
  return string;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function requireInteger(value: unknown, label: string) {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`Supabase returned invalid ${label}.`);
  }
  return value as number;
}

function assertSucceeded(result: RpcResult, message: string) {
  if (result.error) throw new Error(message, { cause: result.error });
}
