import assert from "node:assert/strict";
import test from "node:test";
import { createSupabaseSystemOperationsRepository, isHeartbeatStale } from "./system-operations.js";

test("persistent rate limit consumption maps atomic RPC decisions", async () => {
  const calls: Array<{ name: string; params?: Record<string, unknown> }> = [];
  const repository = createSupabaseSystemOperationsRepository({ async rpc(name, params) {
    calls.push({ name, params });
    return { data: [{ allowed: false, remaining: 0, retry_after_seconds: 60 }], error: null };
  } });
  assert.deepEqual(await repository.consumeRateLimit({ bucketHash: "a".repeat(64), routeGroup: "login", limit: 10, windowSeconds: 900 }), { allowed: false, remaining: 0, retryAfterSeconds: 60 });
  assert.equal(calls[0]?.name, "consume_platform_rate_limit");
  assert.equal(calls[0]?.params?.p_window_seconds, 900);
});

test("heartbeat staleness uses the production forty-five second boundary", () => {
  const heartbeat = { component: "worker", instanceId: "worker-1", releaseVersion: "1.0.0", status: "healthy" as const, metadata: {}, heartbeatAt: "2026-07-15T00:00:00.000Z" };
  assert.equal(isHeartbeatStale(heartbeat, new Date("2026-07-15T00:00:45.000Z")), false);
  assert.equal(isHeartbeatStale(heartbeat, new Date("2026-07-15T00:00:45.001Z")), true);
  assert.equal(isHeartbeatStale(undefined, new Date()), true);
});

test("release state transitions use dedicated guarded RPCs", async () => {
  const calls: string[] = [];
  const row = { id: "record-1", release_version: "1.0.0", migration_version: "000035", archive_name: "backup.tar.age", archive_sha256: "a".repeat(64), status: "verified", started_at: "2026-07-15T00:00:00Z", completed_at: "2026-07-15T00:01:00Z" };
  const repository = createSupabaseSystemOperationsRepository({ async rpc(name) { calls.push(name); return { data: row, error: null }; } });
  const record = await repository.transitionBackup("record-1", "verified", { archiveSha256: "a".repeat(64) });
  assert.equal(record.status, "verified");
  assert.deepEqual(calls, ["transition_platform_backup"]);
});

test("heartbeats and operational events use bounded RPC contracts", async () => {
  const calls: Array<{ name: string; params?: Record<string, unknown> }> = [];
  const heartbeat = {
    component: "worker",
    instance_id: "worker-1",
    release_version: "1.0.0",
    status: "healthy",
    metadata: { queue: "ready" },
    heartbeat_at: "2026-07-15T00:00:00.000Z",
  };
  const event = {
    id: 1,
    component: "backup",
    event_code: "backup_verified",
    level: "info",
    metadata: { duration_seconds: 42 },
    created_at: "2026-07-15T00:01:00.000Z",
  };
  const repository = createSupabaseSystemOperationsRepository({
    async rpc(name, params) {
      calls.push({ name, params });
      if (name === "read_platform_component_heartbeats") return { data: [heartbeat], error: null };
      if (name === "record_platform_operational_event") return { data: event, error: null };
      if (name === "read_platform_operational_events") return { data: [event], error: null };
      return { data: heartbeat, error: null };
    },
  });

  await repository.heartbeat({
    component: "worker",
    instanceId: "worker-1",
    releaseVersion: "1.0.0",
    status: "healthy",
    metadata: { queue: "ready" },
    heartbeatAt: "2026-07-15T00:00:00.000Z",
  });
  assert.equal((await repository.readHeartbeats())[0]?.instanceId, "worker-1");
  assert.equal((await repository.recordEvent({ component: "backup", eventCode: "backup_verified", level: "info", metadata: { duration_seconds: 42 } })).eventCode, "backup_verified");
  assert.equal((await repository.readEvents(25))[0]?.metadata.duration_seconds, 42);
  assert.equal(calls.at(-1)?.params?.p_limit, 25);
});

test("system snapshot maps only safe aggregate operational state", async () => {
  const repository = createSupabaseSystemOperationsRepository({
    async rpc() {
      return {
        data: {
          heartbeats: [],
          jobs: { pending: 2, failed: 1, oldest_pending_at: "2026-07-15T00:00:00.000Z" },
          integrations: { ai: { enabled: true, updated_at: "2026-07-15T00:00:00.000Z" } },
          latest_upgrade: {
            id: "upgrade-1",
            from_version: "1.0.0",
            to_version: "1.1.0",
            status: "healthy",
            started_at: "2026-07-15T00:00:00.000Z",
            completed_at: "2026-07-15T00:02:00.000Z",
          },
        },
        error: null,
      };
    },
  });

  const snapshot = await repository.readSystemSnapshot();
  assert.deepEqual(snapshot.jobs, { pending: 2, failed: 1, oldestPendingAt: "2026-07-15T00:00:00.000Z" });
  assert.equal(snapshot.integrations.ai?.enabled, true);
  assert.equal(snapshot.latestUpgrade?.status, "healthy");
  assert.doesNotMatch(JSON.stringify(snapshot), /password|api_key|credential/u);
});

test("system operation storage failures and malformed rows fail closed", async () => {
  const unavailable = createSupabaseSystemOperationsRepository({
    async rpc() { return { data: null, error: { message: "database secret" } }; },
  });
  await assert.rejects(
    () => unavailable.readHeartbeats(),
    (error: unknown) => error instanceof Error && !error.message.includes("database secret"),
  );

  const malformed = createSupabaseSystemOperationsRepository({
    async rpc() { return { data: [{ allowed: "yes", remaining: 0, retry_after_seconds: 1 }], error: null }; },
  });
  await assert.rejects(() => malformed.consumeRateLimit({
    bucketHash: "a".repeat(64), routeGroup: "login", limit: 10, windowSeconds: 60,
  }), /invalid rate limit allowed/u);
});
