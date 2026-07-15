import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  createSupabasePlatformJobRepository,
  RESERVATION_SUPABASE_JOB_RPCS,
  type PlatformJobsSupabaseClient,
} from "./jobs.js";

type Result = { data: unknown; error: unknown | null };

const migration = readFileSync(resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../database/migrations/supabase/000029_durable_jobs_notifications.sql",
), "utf8");

function client(calls: unknown[], results: Result[]): PlatformJobsSupabaseClient {
  return {
    async rpc(name, params) {
      calls.push([name, params]);
      return results.shift() ?? { data: null, error: null };
    },
  };
}

const jobRow = {
  job_id: "11111111-1111-4111-8111-111111111111",
  tenant_id: "tenant-1",
  venue_id: "22222222-2222-4222-8222-222222222222",
  kind: "notification.email",
  payload: { bookingId: "booking-1" },
  attempts: 1,
  max_attempts: 5,
  available_at: "2026-07-15T00:00:00.000Z",
  leased_until: "2026-07-15T00:00:30.000Z",
};

test("enqueue delegates tenant-idempotent insertion to one RPC", async () => {
  const calls: unknown[] = [];
  const repository = createSupabasePlatformJobRepository(client(calls, [{
    data: [{ job_id: jobRow.job_id }],
    error: null,
  }]));

  const first = await repository.enqueue({
    tenantId: "tenant-1",
    venueId: jobRow.venue_id,
    kind: "notification.email",
    payload: jobRow.payload,
    maxAttempts: 5,
    idempotencyKey: "booking:booking-1:confirmation",
  });

  assert.deepEqual(first, { jobId: jobRow.job_id });
  assert.deepEqual(calls, [[RESERVATION_SUPABASE_JOB_RPCS.enqueue, {
    p_tenant_id: "tenant-1",
    p_venue_id: jobRow.venue_id,
    p_kind: "notification.email",
    p_payload: jobRow.payload,
    p_max_attempts: 5,
    p_available_at: null,
    p_idempotency_key: "booking:booking-1:confirmation",
  }]]);
});

test("claim maps one atomic lease RPC response", async () => {
  const calls: unknown[] = [];
  const repository = createSupabasePlatformJobRepository(client(calls, [{ data: [jobRow], error: null }]));

  assert.deepEqual(await repository.claim({ workerId: "worker-a", limit: 10, leaseSeconds: 30 }), [{
    jobId: jobRow.job_id,
    tenantId: jobRow.tenant_id,
    venueId: jobRow.venue_id,
    kind: jobRow.kind,
    payload: jobRow.payload,
    attempts: 1,
    maxAttempts: 5,
    availableAt: jobRow.available_at,
    leasedUntil: jobRow.leased_until,
  }]);
  assert.deepEqual(calls, [[RESERVATION_SUPABASE_JOB_RPCS.claim, {
    p_worker_id: "worker-a",
    p_limit: 10,
    p_lease_seconds: 30,
  }]]);
});

test("completion, retry, and failure mutations retain lease ownership", async () => {
  const calls: unknown[] = [];
  const repository = createSupabasePlatformJobRepository(client(calls, [
    { data: true, error: null },
    { data: true, error: null },
    { data: true, error: null },
  ]));

  await repository.complete(jobRow.job_id, "worker-a");
  await repository.retry(jobRow.job_id, "worker-a", "2026-07-15T00:01:00.000Z", "timeout");
  await repository.fail(jobRow.job_id, "worker-a", "invalid_recipient");

  assert.deepEqual(calls, [
    [RESERVATION_SUPABASE_JOB_RPCS.complete, { p_job_id: jobRow.job_id, p_worker_id: "worker-a" }],
    [RESERVATION_SUPABASE_JOB_RPCS.retry, {
      p_job_id: jobRow.job_id,
      p_worker_id: "worker-a",
      p_available_at: "2026-07-15T00:01:00.000Z",
      p_error_code: "timeout",
    }],
    [RESERVATION_SUPABASE_JOB_RPCS.fail, {
      p_job_id: jobRow.job_id,
      p_worker_id: "worker-a",
      p_error_code: "invalid_recipient",
    }],
  ]);
});

test("a lost lease is surfaced instead of silently dropping the transition", async () => {
  const repository = createSupabasePlatformJobRepository(client([], [{ data: false, error: null }]));
  await assert.rejects(
    () => repository.complete(jobRow.job_id, "stale-worker"),
    /lease is no longer owned/u,
  );
});

test("malformed jobs and storage failures fail closed", async () => {
  const failed = createSupabasePlatformJobRepository(client([], [{
    data: null,
    error: { code: "P0001", message: "unsafe detail" },
  }]));
  await assert.rejects(
    () => failed.claim({ workerId: "worker-a", limit: 1, leaseSeconds: 30 }),
    { message: "Failed to claim platform jobs." },
  );

  const malformed = createSupabasePlatformJobRepository(client([], [{
    data: [{ ...jobRow, payload: [] }],
    error: null,
  }]));
  await assert.rejects(
    () => malformed.claim({ workerId: "worker-a", limit: 1, leaseSeconds: 30 }),
    /invalid job payload/u,
  );
});

test("job migration locks claims and enforces tenant idempotency", () => {
  assert.match(migration, /unique \(tenant_id, idempotency_key\)/iu);
  assert.match(migration, /for update skip locked/iu);
  assert.match(migration, /on conflict \(tenant_id, idempotency_key\) do update/iu);
  assert.match(migration, /status = 'leased'[\s\S]*lease_owner = p_worker_id/iu);
});

test("expired final-attempt leases become terminal instead of remaining stuck", () => {
  assert.match(
    migration,
    /set status = 'failed',[\s\S]*error_code = 'lease_expired'[\s\S]*leased_until <= now\(\)[\s\S]*attempts >= exhausted\.max_attempts/iu,
  );
  assert.match(migration, /status = 'leased' and candidate\.leased_until <= now\(\)/iu);
  assert.match(migration, /candidate\.attempts < candidate\.max_attempts/iu);
});

test("notification delivery state and queue tables are service-role only", () => {
  assert.match(migration, /create table public\.platform_notification_deliveries/iu);
  assert.match(migration, /primary key \(booking_id, notification_kind\)/iu);
  assert.match(migration, /alter table public\.platform_jobs enable row level security/iu);
  assert.match(migration, /revoke all on table public\.platform_jobs from public, anon, authenticated, service_role/iu);
});
