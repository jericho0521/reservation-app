import type { SystemComponentStatus, SystemStatusResponse } from "@reservation-platform/contract-types";

export interface SystemStatusHeartbeat {
  component: string;
  status: "healthy" | "degraded";
  heartbeatAt: string;
}

export interface SystemStatusSnapshot {
  heartbeats: readonly SystemStatusHeartbeat[];
  jobs: { pending: number; failed: number; oldestPendingAt?: string };
  lastVerifiedBackup?: { completedAt?: string };
  integrations: Readonly<Record<string, { enabled: boolean; updatedAt?: string }>>;
  whatsapp?: { status: string; lastConnectedAt?: string; updatedAt?: string };
}

export interface SystemStatusRepository {
  readSystemSnapshot(): Promise<SystemStatusSnapshot>;
}

export interface SystemStatusDependencies {
  repository: SystemStatusRepository;
  readReadiness: () => Promise<{ database: boolean; migrations: boolean }>;
  releaseVersion: string;
  migrationVersion: string;
  diskProbe?: () => Promise<{ usedPercent: number }>;
  now?: () => Date;
  workerStaleAfterSeconds?: number;
}

export async function readSystemStatus(dependencies: SystemStatusDependencies): Promise<SystemStatusResponse> {
  const now = dependencies.now?.() ?? new Date();
  const [readiness, snapshot, disk] = await Promise.all([
    safeReadiness(dependencies.readReadiness),
    dependencies.repository.readSystemSnapshot(),
    safeDiskProbe(dependencies.diskProbe),
  ]);
  const worker = snapshot.heartbeats.find((item) => item.component === "worker");
  const workerAgeSeconds = ageSeconds(worker?.heartbeatAt, now);
  const workerStaleAfterSeconds = dependencies.workerStaleAfterSeconds ?? 45;
  const components = {
    database: component(readiness.database ? "healthy" : "offline", "Check PostgreSQL connectivity and credentials."),
    migrations: component(readiness.migrations ? "healthy" : readiness.database ? "degraded" : "offline", "Run the production migration service."),
    worker: component(!worker || workerAgeSeconds > workerStaleAfterSeconds ? "offline" : worker.status, "Restart the worker and inspect safe job error codes.", worker?.heartbeatAt),
    email: integrationComponent(snapshot.integrations.email, "Save and test email delivery settings."),
    ai: integrationComponent(snapshot.integrations.ai, "Save and test the AI provider settings."),
    whatsapp: whatsappComponent(snapshot.whatsapp),
    disk: component(disk.usedPercent >= 95 ? "offline" : disk.usedPercent >= 85 ? "degraded" : "healthy", "Free disk space or expand the host volume."),
    backup: component(snapshot.lastVerifiedBackup ? "healthy" : "degraded", "Create and verify an encrypted backup.", snapshot.lastVerifiedBackup?.completedAt),
  } satisfies SystemStatusResponse["components"];
  const states = Object.values(components).map((value) => value.status);
  const oldestAge = snapshot.jobs.oldestPendingAt ? ageSeconds(snapshot.jobs.oldestPendingAt, now) : 0;
  return {
    generated_at: now.toISOString(),
    status: states.includes("offline") ? "offline" : states.includes("degraded") || snapshot.jobs.failed > 0 ? "degraded" : "healthy",
    release_version: dependencies.releaseVersion,
    migration_version: dependencies.migrationVersion,
    components,
    jobs: { pending: snapshot.jobs.pending, failed: snapshot.jobs.failed, oldest_age_seconds: oldestAge },
  };
}

function integrationComponent(value: { enabled: boolean; updatedAt?: string } | undefined, action: string): SystemComponentStatus {
  return component(value?.enabled ? "healthy" : "degraded", action, value?.updatedAt);
}
function whatsappComponent(value: SystemStatusSnapshot["whatsapp"]): SystemComponentStatus {
  return component(value?.status === "connected" ? "healthy" : value ? "degraded" : "offline", "Reconnect WhatsApp from Channels & AI.", value?.lastConnectedAt ?? value?.updatedAt);
}
function component(status: SystemComponentStatus["status"], action: string, lastSuccessAt?: string): SystemComponentStatus {
  return { status, action, ...(lastSuccessAt ? { last_success_at: lastSuccessAt } : {}) };
}
function ageSeconds(value: string | undefined, now: Date) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor((now.valueOf() - parsed) / 1_000)) : 0;
}
async function safeReadiness(read: SystemStatusDependencies["readReadiness"]) {
  try { return await read(); } catch { return { database: false, migrations: false }; }
}
async function safeDiskProbe(probe: SystemStatusDependencies["diskProbe"]) {
  try { return probe ? await probe() : { usedPercent: 0 }; } catch { return { usedPercent: 100 }; }
}
