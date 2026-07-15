import { installationBusinessResponseSchema } from "@reservation-platform/contract-types";
import {
  OnboardingRepositoryConflictError,
  type InstallationBusinessRepository,
} from "@reservation-platform/api";

type QueryResult = { data: unknown; error: unknown | null };

interface InstallationQueryBuilder extends PromiseLike<QueryResult> {
  select(columns?: string): InstallationQueryBuilder;
  eq(column: string, value: unknown): InstallationQueryBuilder;
  gt(column: string, value: unknown): InstallationQueryBuilder;
  is(column: string, value: unknown): InstallationQueryBuilder;
  update(value: unknown): InstallationQueryBuilder;
  insert(value: unknown): InstallationQueryBuilder;
  maybeSingle(): Promise<QueryResult>;
}

export interface InstallationSupabaseClient {
  from(table: string): InstallationQueryBuilder;
}

export interface InstallationBusinessSupabaseClient {
  rpc(name: string, params?: Record<string, unknown>): Promise<QueryResult>;
}

export interface InstallationRecord {
  installationId: string;
  tenantId: string;
  setupCompleted: boolean;
  domain: string;
  setupTokenHash?: string;
  setupExpiresAt?: string;
}

export interface InstallationRepository {
  readInstallation(): Promise<InstallationRecord | undefined>;
  consumeSetupToken(input: {
    tokenHash: string;
    now: string;
  }): Promise<InstallationRecord | undefined>;
}

export interface AuditEventInput {
  tenantId: string;
  venueId?: string;
  actorUserId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  beforeValue?: unknown;
  afterValue?: unknown;
  reason?: string;
  correlationId?: string;
}

export interface AuditRepository {
  record(input: AuditEventInput): Promise<void>;
}

const installationSelect =
  "id, tenant_id, domain, setup_token_hash, setup_expires_at, setup_completed_at";
const sha256Pattern = /^[a-f0-9]{64}$/u;

export function createSupabaseInstallationRepository(
  client: InstallationSupabaseClient,
): InstallationRepository {
  return {
    async readInstallation() {
      const result = await client
        .from("platform_installation")
        .select(installationSelect)
        .eq("singleton", true)
        .maybeSingle();
      assertQuerySucceeded(result, "Failed to read platform installation.");
      return result.data ? adaptInstallation(result.data) : undefined;
    },
    async consumeSetupToken({ tokenHash, now }) {
      if (!sha256Pattern.test(tokenHash)) return undefined;
      const result = await client
        .from("platform_installation")
        .update({
          setup_token_hash: null,
          setup_completed_at: now,
          updated_at: now,
        })
        .eq("singleton", true)
        .eq("setup_token_hash", tokenHash)
        .is("setup_completed_at", null)
        .gt("setup_expires_at", now)
        .select(installationSelect)
        .maybeSingle();
      assertQuerySucceeded(result, "Failed to consume platform setup token.");
      return result.data ? adaptInstallation(result.data) : undefined;
    },
  };
}

export function createSupabaseInstallationBusinessRepository(
  client: InstallationBusinessSupabaseClient,
): InstallationBusinessRepository {
  return {
    async readBusiness(tenantId) {
      const result = await client.rpc("platform_read_installation_business", {
        p_tenant_id: tenantId,
      });
      assertOnboardingQuerySucceeded(result, "Failed to read installation business.");
      if (result.data === null) return undefined;
      return installationBusinessResponseSchema.parse(unwrapRpcValue(result.data));
    },
    async configureBusiness({ tenantId, ownerUserId, business }) {
      const result = await client.rpc("platform_configure_installation_business", {
        p_tenant_id: tenantId,
        p_owner_user_id: ownerUserId,
        p_name: business.name,
        p_public_slug: business.public_slug,
        p_timezone: business.timezone,
        p_location_name: business.location.name,
        p_location_address: business.location.address ?? null,
      });
      assertOnboardingQuerySucceeded(result, "Failed to configure installation business.");
      return installationBusinessResponseSchema.parse(unwrapRpcValue(result.data));
    },
  };
}

export function createSupabaseAuditRepository(
  client: InstallationSupabaseClient,
): AuditRepository {
  return {
    async record(input) {
      const result = await client.from("platform_audit_events").insert([{
        tenant_id: input.tenantId,
        venue_id: input.venueId ?? null,
        actor_user_id: input.actorUserId ?? null,
        action: input.action,
        entity_type: input.entityType,
        entity_id: input.entityId ?? null,
        before_value: input.beforeValue ?? null,
        after_value: input.afterValue ?? null,
        reason: input.reason ?? null,
        correlation_id: input.correlationId ?? null,
      }]);
      assertQuerySucceeded(result, "Failed to record platform audit event.");
    },
  };
}

function adaptInstallation(value: unknown): InstallationRecord {
  const row = asRecord(value);
  return {
    installationId: requireString(row.id, "installation id"),
    tenantId: requireString(row.tenant_id, "installation tenant id"),
    domain: requireString(row.domain, "installation domain"),
    setupCompleted: typeof row.setup_completed_at === "string",
    ...(typeof row.setup_token_hash === "string"
      ? { setupTokenHash: row.setup_token_hash }
      : {}),
    ...(typeof row.setup_expires_at === "string"
      ? { setupExpiresAt: row.setup_expires_at }
      : {}),
  };
}

function assertQuerySucceeded(result: QueryResult, message: string) {
  if (result.error) throw new Error(message, { cause: result.error });
}

function assertOnboardingQuerySucceeded(result: QueryResult, message: string) {
  if (!result.error) return;
  const error = asQueryError(result.error);
  if (error.code === "23505") {
    throw new OnboardingRepositoryConflictError(
      error.message?.includes("slug") ? "public_slug" : "location_name",
    );
  }
  throw new Error(message, { cause: result.error });
}

function unwrapRpcValue(value: unknown): unknown {
  return Array.isArray(value) && value.length === 1 ? value[0] : value;
}

function asQueryError(value: unknown): { code?: string; message?: string } {
  return value && typeof value === "object" ? value as { code?: string; message?: string } : {};
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Supabase returned an invalid platform installation row.");
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, label: string) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Supabase returned an invalid ${label}.`);
  }
  return value;
}
