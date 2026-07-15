export type ComponentHealth = "healthy" | "degraded";

export interface ComponentHeartbeat {
  component: string;
  instanceId: string;
  releaseVersion: string;
  status: ComponentHealth;
  metadata: Readonly<Record<string, unknown>>;
  heartbeatAt: string;
}

export interface RateLimitInput {
  bucketHash: string;
  routeGroup: string;
  limit: number;
  windowSeconds: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export interface BackupRecord {
  id: string;
  releaseVersion: string;
  migrationVersion: string;
  archiveName: string;
  archiveSha256?: string;
  status: "started" | "verified" | "failed";
  errorCode?: string;
  startedAt: string;
  completedAt?: string;
}

export interface BackupRecordInput {
  releaseVersion: string;
  migrationVersion: string;
  archiveName: string;
}

export interface UpgradeRecord {
  id: string;
  fromVersion: string;
  toVersion: string;
  backupId?: string;
  status: "started" | "healthy" | "failed" | "rolled_back";
  errorCode?: string;
  startedAt: string;
  completedAt?: string;
}

export interface UpgradeRecordInput {
  fromVersion: string;
  toVersion: string;
  backupId?: string;
}

export interface OperationalEvent {
  id: number;
  component: string;
  eventCode: string;
  level: "info" | "warn" | "error";
  metadata: Readonly<Record<string, unknown>>;
  createdAt: string;
}

export interface OperationalEventInput {
  component: string;
  eventCode: string;
  level: OperationalEvent["level"];
  metadata?: Readonly<Record<string, unknown>>;
}

export interface SystemOperationsSnapshot {
  heartbeats: readonly ComponentHeartbeat[];
  jobs: { pending: number; failed: number; oldestPendingAt?: string };
  lastVerifiedBackup?: BackupRecord;
  latestUpgrade?: UpgradeRecord;
  integrations: Readonly<Record<string, { enabled: boolean; updatedAt?: string }>>;
  whatsapp?: { status: string; lastConnectedAt?: string; updatedAt?: string };
}

export interface SystemOperationsRepository {
  heartbeat(input: ComponentHeartbeat): Promise<void>;
  readHeartbeats(): Promise<readonly ComponentHeartbeat[]>;
  consumeRateLimit(input: RateLimitInput): Promise<RateLimitDecision>;
  recordBackup(input: BackupRecordInput): Promise<BackupRecord>;
  transitionBackup(id: string, status: "verified" | "failed", details?: { archiveSha256?: string; errorCode?: string }): Promise<BackupRecord>;
  recordUpgrade(input: UpgradeRecordInput): Promise<UpgradeRecord>;
  transitionUpgrade(id: string, status: "healthy" | "failed" | "rolled_back", errorCode?: string): Promise<UpgradeRecord>;
  recordEvent(input: OperationalEventInput): Promise<OperationalEvent>;
  readEvents(limit?: number): Promise<readonly OperationalEvent[]>;
  readSystemSnapshot(): Promise<SystemOperationsSnapshot>;
}

type RpcResult = { data: unknown; error: unknown | null };

export interface SystemOperationsSupabaseClient {
  rpc(name: string, params?: Record<string, unknown>): Promise<RpcResult>;
}

export const RESERVATION_SUPABASE_SYSTEM_OPERATION_RPCS = {
  heartbeat: "record_platform_component_heartbeat",
  readHeartbeats: "read_platform_component_heartbeats",
  consumeRateLimit: "consume_platform_rate_limit",
  recordBackup: "record_platform_backup",
  transitionBackup: "transition_platform_backup",
  recordUpgrade: "record_platform_upgrade",
  transitionUpgrade: "transition_platform_upgrade",
  recordEvent: "record_platform_operational_event",
  readEvents: "read_platform_operational_events",
  readSystemSnapshot: "read_platform_system_operations",
} as const;

export function createSupabaseSystemOperationsRepository(
  client: SystemOperationsSupabaseClient,
): SystemOperationsRepository {
  return {
    async heartbeat(input) {
      await rpc(client, RESERVATION_SUPABASE_SYSTEM_OPERATION_RPCS.heartbeat, {
        p_component: input.component,
        p_instance_id: input.instanceId,
        p_release_version: input.releaseVersion,
        p_status: input.status,
        p_metadata: input.metadata,
        p_heartbeat_at: input.heartbeatAt,
      });
    },
    async readHeartbeats() {
      const data = await rpc(client, RESERVATION_SUPABASE_SYSTEM_OPERATION_RPCS.readHeartbeats);
      return asArray(data, "component heartbeats").map(adaptHeartbeat);
    },
    async consumeRateLimit(input) {
      const data = await rpc(client, RESERVATION_SUPABASE_SYSTEM_OPERATION_RPCS.consumeRateLimit, {
        p_bucket_hash: input.bucketHash,
        p_route_group: input.routeGroup,
        p_limit: input.limit,
        p_window_seconds: input.windowSeconds,
      });
      const row = firstRecord(data, "rate limit decision");
      return {
        allowed: requireBoolean(row.allowed, "rate limit allowed"),
        remaining: requireNonnegativeInteger(row.remaining, "rate limit remaining"),
        retryAfterSeconds: requirePositiveInteger(row.retry_after_seconds, "rate limit retry interval"),
      };
    },
    async recordBackup(input) {
      return adaptBackup(firstRecord(await rpc(client, RESERVATION_SUPABASE_SYSTEM_OPERATION_RPCS.recordBackup, {
        p_release_version: input.releaseVersion,
        p_migration_version: input.migrationVersion,
        p_archive_name: input.archiveName,
      }), "backup record"));
    },
    async transitionBackup(id, status, details = {}) {
      return adaptBackup(firstRecord(await rpc(client, RESERVATION_SUPABASE_SYSTEM_OPERATION_RPCS.transitionBackup, {
        p_id: id,
        p_status: status,
        p_archive_sha256: details.archiveSha256 ?? null,
        p_error_code: details.errorCode ?? null,
      }), "backup record"));
    },
    async recordUpgrade(input) {
      return adaptUpgrade(firstRecord(await rpc(client, RESERVATION_SUPABASE_SYSTEM_OPERATION_RPCS.recordUpgrade, {
        p_from_version: input.fromVersion,
        p_to_version: input.toVersion,
        p_backup_id: input.backupId ?? null,
      }), "upgrade record"));
    },
    async transitionUpgrade(id, status, errorCode) {
      return adaptUpgrade(firstRecord(await rpc(client, RESERVATION_SUPABASE_SYSTEM_OPERATION_RPCS.transitionUpgrade, {
        p_id: id,
        p_status: status,
        p_error_code: errorCode ?? null,
      }), "upgrade record"));
    },
    async recordEvent(input) {
      return adaptEvent(firstRecord(await rpc(client, RESERVATION_SUPABASE_SYSTEM_OPERATION_RPCS.recordEvent, {
        p_component: input.component,
        p_event_code: input.eventCode,
        p_level: input.level,
        p_metadata: input.metadata ?? {},
      }), "operational event"));
    },
    async readEvents(limit = 50) {
      const data = await rpc(client, RESERVATION_SUPABASE_SYSTEM_OPERATION_RPCS.readEvents, { p_limit: limit });
      return asArray(data, "operational events").map(adaptEvent);
    },
    async readSystemSnapshot() {
      return adaptSystemSnapshot(asRecord(await rpc(client, RESERVATION_SUPABASE_SYSTEM_OPERATION_RPCS.readSystemSnapshot), "system operations"));
    },
  };
}

export function isHeartbeatStale(heartbeat: ComponentHeartbeat | undefined, now = new Date(), staleAfterSeconds = 45) {
  if (!heartbeat) return true;
  const heartbeatMs = Date.parse(heartbeat.heartbeatAt);
  return !Number.isFinite(heartbeatMs) || now.valueOf() - heartbeatMs > staleAfterSeconds * 1_000;
}

async function rpc(client: SystemOperationsSupabaseClient, name: string, params?: Record<string, unknown>) {
  const result = await client.rpc(name, params);
  if (result.error) throw new Error(`System operations RPC ${name} failed.`, { cause: result.error });
  return result.data;
}

function adaptHeartbeat(value: unknown): ComponentHeartbeat {
  const row = asRecord(value, "component heartbeat");
  const status = requireString(row.status, "heartbeat status");
  if (status !== "healthy" && status !== "degraded") throw new Error("Supabase returned an invalid heartbeat status.");
  return {
    component: requireString(row.component, "heartbeat component"),
    instanceId: requireString(row.instance_id, "heartbeat instance"),
    releaseVersion: requireString(row.release_version, "heartbeat release"),
    status,
    metadata: asRecord(row.metadata ?? {}, "heartbeat metadata"),
    heartbeatAt: requireString(row.heartbeat_at, "heartbeat time"),
  };
}

function adaptBackup(value: unknown): BackupRecord {
  const row = asRecord(value, "backup record");
  const status = requireString(row.status, "backup status");
  if (status !== "started" && status !== "verified" && status !== "failed") throw new Error("Supabase returned an invalid backup status.");
  return {
    id: requireString(row.id, "backup id"), releaseVersion: requireString(row.release_version, "backup release"),
    migrationVersion: requireString(row.migration_version, "backup migration"), archiveName: requireString(row.archive_name, "backup archive"), status,
    startedAt: requireString(row.started_at, "backup start"),
    ...(optionalString(row.archive_sha256) ? { archiveSha256: optionalString(row.archive_sha256)! } : {}),
    ...(optionalString(row.error_code) ? { errorCode: optionalString(row.error_code)! } : {}),
    ...(optionalString(row.completed_at) ? { completedAt: optionalString(row.completed_at)! } : {}),
  };
}

function adaptUpgrade(value: unknown): UpgradeRecord {
  const row = asRecord(value, "upgrade record");
  const status = requireString(row.status, "upgrade status");
  if (!["started", "healthy", "failed", "rolled_back"].includes(status)) throw new Error("Supabase returned an invalid upgrade status.");
  return {
    id: requireString(row.id, "upgrade id"), fromVersion: requireString(row.from_version, "upgrade source release"),
    toVersion: requireString(row.to_version, "upgrade target release"), status: status as UpgradeRecord["status"],
    startedAt: requireString(row.started_at, "upgrade start"),
    ...(optionalString(row.backup_id) ? { backupId: optionalString(row.backup_id)! } : {}),
    ...(optionalString(row.error_code) ? { errorCode: optionalString(row.error_code)! } : {}),
    ...(optionalString(row.completed_at) ? { completedAt: optionalString(row.completed_at)! } : {}),
  };
}

function adaptEvent(value: unknown): OperationalEvent {
  const row = asRecord(value, "operational event");
  const level = requireString(row.level, "operational event level");
  if (level !== "info" && level !== "warn" && level !== "error") {
    throw new Error("Supabase returned an invalid operational event level.");
  }
  return {
    id: requireNonnegativeInteger(row.id, "operational event id"),
    component: requireString(row.component, "operational event component"),
    eventCode: requireString(row.event_code, "operational event code"),
    level,
    metadata: asRecord(row.metadata ?? {}, "operational event metadata"),
    createdAt: requireString(row.created_at, "operational event time"),
  };
}

function adaptSystemSnapshot(row: Record<string, unknown>): SystemOperationsSnapshot {
  const jobs = asRecord(row.jobs ?? {}, "system jobs");
  const integrations = asRecord(row.integrations ?? {}, "system integrations");
  return {
    heartbeats: asArray(row.heartbeats ?? [], "system heartbeats").map(adaptHeartbeat),
    jobs: {
      pending: requireNonnegativeInteger(jobs.pending ?? 0, "pending jobs"),
      failed: requireNonnegativeInteger(jobs.failed ?? 0, "failed jobs"),
      ...(optionalString(jobs.oldest_pending_at) ? { oldestPendingAt: optionalString(jobs.oldest_pending_at)! } : {}),
    },
    ...(row.last_verified_backup ? { lastVerifiedBackup: adaptBackup(row.last_verified_backup) } : {}),
    ...(row.latest_upgrade ? { latestUpgrade: adaptUpgrade(row.latest_upgrade) } : {}),
    integrations: Object.fromEntries(Object.entries(integrations).map(([kind, value]) => {
      const integration = asRecord(value, "integration status");
      return [kind, { enabled: requireBoolean(integration.enabled, "integration enabled"), ...(optionalString(integration.updated_at) ? { updatedAt: optionalString(integration.updated_at)! } : {}) }];
    })),
    ...(row.whatsapp ? { whatsapp: adaptWhatsApp(row.whatsapp) } : {}),
  };
}

function adaptWhatsApp(value: unknown) {
  const row = asRecord(value, "WhatsApp status");
  return { status: requireString(row.status, "WhatsApp status"), ...(optionalString(row.last_connected_at) ? { lastConnectedAt: optionalString(row.last_connected_at)! } : {}), ...(optionalString(row.updated_at) ? { updatedAt: optionalString(row.updated_at)! } : {}) };
}

function firstRecord(value: unknown, label: string) {
  const row = Array.isArray(value) ? value[0] : value;
  return asRecord(row, label);
}
function asArray(value: unknown, label: string): unknown[] { if (!Array.isArray(value)) throw new Error(`Supabase returned invalid ${label}.`); return value; }
function asRecord(value: unknown, label: string): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Supabase returned invalid ${label}.`); return value as Record<string, unknown>; }
function optionalString(value: unknown) { return typeof value === "string" && value.length > 0 ? value : undefined; }
function requireString(value: unknown, label: string) { const string = optionalString(value); if (!string) throw new Error(`Supabase returned invalid ${label}.`); return string; }
function requireBoolean(value: unknown, label: string) { if (typeof value !== "boolean") throw new Error(`Supabase returned invalid ${label}.`); return value; }
function requireNonnegativeInteger(value: unknown, label: string) { if (!Number.isInteger(value) || (value as number) < 0) throw new Error(`Supabase returned invalid ${label}.`); return value as number; }
function requirePositiveInteger(value: unknown, label: string) { const number = requireNonnegativeInteger(value, label); if (number < 1) throw new Error(`Supabase returned invalid ${label}.`); return number; }
