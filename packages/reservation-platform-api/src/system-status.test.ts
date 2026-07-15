import assert from "node:assert/strict";
import test from "node:test";
import { readSystemStatus } from "./system-status.js";

test("system status marks a stale worker heartbeat offline without exposing raw errors", async () => {
  const status = await readSystemStatus({
    repository: { async readSystemSnapshot() { return { heartbeats: [{ component: "worker", status: "healthy", heartbeatAt: "2026-07-15T00:00:00Z" }], jobs: { pending: 2, failed: 1, oldestPendingAt: "2026-07-14T23:59:00Z" }, integrations: { email: { enabled: true }, ai: { enabled: true } }, whatsapp: { status: "connected", lastConnectedAt: "2026-07-15T00:00:00Z" }, lastVerifiedBackup: { completedAt: "2026-07-14T00:00:00Z" } }; } },
    readReadiness: async () => ({ database: true, migrations: true }), releaseVersion: "1.0.0", migrationVersion: "000035",
    now: () => new Date("2026-07-15T00:02:00Z"), diskProbe: async () => ({ usedPercent: 20 }),
  });
  assert.equal(status.components.worker.status, "offline");
  assert.equal(status.status, "offline");
  assert.deepEqual(status.jobs, { pending: 2, failed: 1, oldest_age_seconds: 180 });
  assert.doesNotMatch(JSON.stringify(status), /exception|password|secret/iu);
});

test("system status degrades on low disk and missing backup", async () => {
  const status = await readSystemStatus({ repository: { async readSystemSnapshot() { return { heartbeats: [{ component: "worker", status: "healthy", heartbeatAt: "2026-07-15T00:00:00Z" }], jobs: { pending: 0, failed: 0 }, integrations: {} }; } }, readReadiness: async () => ({ database: true, migrations: true }), releaseVersion: "dev", migrationVersion: "000035", now: () => new Date("2026-07-15T00:00:10Z"), diskProbe: async () => ({ usedPercent: 90 }) });
  assert.equal(status.components.disk.status, "degraded");
  assert.equal(status.components.backup.status, "degraded");
});
