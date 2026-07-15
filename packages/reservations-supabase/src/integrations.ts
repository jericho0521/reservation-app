export type IntegrationKind = "email" | "ai" | "whatsapp";

export interface SecretEnvelopeV1 {
  v: 1;
  alg: "aes-256-gcm";
  iv: string;
  tag: string;
  ciphertext: string;
}

export interface IntegrationSettingsRecord {
  tenantId: string;
  kind: IntegrationKind;
  enabled: boolean;
  provider: string;
  publicConfig: Record<string, unknown>;
  credentialPresent: boolean;
  updatedAt: string;
}

export interface IntegrationSettingsRepository {
  read(tenantId: string, kind: IntegrationKind): Promise<IntegrationSettingsRecord | undefined>;
  saveSettings(input: Omit<IntegrationSettingsRecord, "credentialPresent" | "updatedAt"> & {
    actorUserId: string;
    envelope?: SecretEnvelopeV1;
  }): Promise<IntegrationSettingsRecord>;
  rotateCredential(input: {
    tenantId: string;
    kind: IntegrationKind;
    actorUserId: string;
    envelope: SecretEnvelopeV1;
  }): Promise<void>;
  readCredential(tenantId: string, kind: IntegrationKind): Promise<SecretEnvelopeV1 | undefined>;
  deleteCredential(input: {
    tenantId: string;
    kind: IntegrationKind;
    actorUserId: string;
  }): Promise<void>;
}

type QueryResult = { data: unknown; error: unknown | null };

interface IntegrationQueryBuilder extends PromiseLike<QueryResult> {
  select(columns?: string): IntegrationQueryBuilder;
  eq(column: string, value: unknown): IntegrationQueryBuilder;
  upsert(value: unknown, options?: { onConflict?: string }): IntegrationQueryBuilder;
  delete(): IntegrationQueryBuilder;
  maybeSingle(): Promise<QueryResult>;
}

export interface IntegrationSupabaseClient {
  from(table: string): IntegrationQueryBuilder;
  rpc(name: string, params?: Record<string, unknown>): Promise<QueryResult>;
}

const settingsColumns = "tenant_id, kind, enabled, provider, public_config, updated_at";
const envelopeColumns = "envelope";

export function createSupabaseIntegrationSettingsRepository(
  client: IntegrationSupabaseClient,
): IntegrationSettingsRepository {
  async function read(
    tenantId: string,
    kind: IntegrationKind,
  ): Promise<IntegrationSettingsRecord | undefined> {
    const settingsResult = await client
      .from("platform_integration_settings")
      .select(settingsColumns)
      .eq("tenant_id", tenantId)
      .eq("kind", kind)
      .maybeSingle();
    assertSucceeded(settingsResult, "Failed to read integration settings.");
    if (!settingsResult.data) return undefined;

    const credentialResult = await client
      .from("platform_integration_credentials")
      .select("tenant_id")
      .eq("tenant_id", tenantId)
      .eq("kind", kind)
      .maybeSingle();
    assertSucceeded(credentialResult, "Failed to read integration credential status.");
    return adaptSettings(settingsResult.data, credentialResult.data !== null);
  }

  return {
    read,

    async saveSettings(input) {
      const result = await client.rpc("platform_save_integration_settings", {
        p_tenant_id: input.tenantId,
        p_actor_user_id: input.actorUserId,
        p_kind: input.kind,
        p_enabled: input.enabled,
        p_provider: input.provider,
        p_public_config: input.publicConfig,
        p_envelope: input.envelope ?? null,
      });
      assertSucceeded(result, "Failed to save integration settings.");
      return adaptSettings(result.data, readCredentialPresent(result.data));
    },

    async rotateCredential(input) {
      const result = await client.rpc("platform_rotate_integration_credential", {
        p_tenant_id: input.tenantId,
        p_actor_user_id: input.actorUserId,
        p_kind: input.kind,
        p_envelope: input.envelope,
      });
      assertSucceeded(result, "Failed to save integration credential.");
    },

    async readCredential(tenantId, kind) {
      const result = await client
        .from("platform_integration_credentials")
        .select(envelopeColumns)
        .eq("tenant_id", tenantId)
        .eq("kind", kind)
        .maybeSingle();
      assertSucceeded(result, "Failed to read integration credential.");
      if (!result.data) return undefined;
      return adaptEnvelope(asRecord(result.data, "integration credential").envelope);
    },

    async deleteCredential(input) {
      const result = await client.rpc("platform_delete_integration_credential", {
        p_tenant_id: input.tenantId,
        p_actor_user_id: input.actorUserId,
        p_kind: input.kind,
      });
      assertSucceeded(result, "Failed to delete integration credential.");
    },
  };
}

function readCredentialPresent(value: unknown): boolean {
  return requireBoolean(asRecord(value, "integration settings").credential_present, "integration credential state");
}

function adaptSettings(value: unknown, credentialPresent: boolean): IntegrationSettingsRecord {
  const row = asRecord(value, "integration settings");
  return {
    tenantId: requireString(row.tenant_id, "integration tenant id"),
    kind: requireKind(row.kind),
    enabled: requireBoolean(row.enabled, "integration enabled state"),
    provider: requireString(row.provider, "integration provider"),
    publicConfig: asRecord(row.public_config, "public integration configuration"),
    credentialPresent,
    updatedAt: requireString(row.updated_at, "integration update timestamp"),
  };
}

function adaptEnvelope(value: unknown): SecretEnvelopeV1 {
  const envelope = asRecord(value, "secret envelope");
  if (envelope.v !== 1 || envelope.alg !== "aes-256-gcm") {
    throw new Error("Supabase returned an invalid secret envelope.");
  }
  return {
    v: 1,
    alg: "aes-256-gcm",
    iv: requireString(envelope.iv, "secret envelope iv"),
    tag: requireString(envelope.tag, "secret envelope tag"),
    ciphertext: requireString(envelope.ciphertext, "secret envelope ciphertext"),
  };
}

function assertSucceeded(result: QueryResult, message: string) {
  if (result.error) throw new Error(message, { cause: result.error });
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Supabase returned invalid ${label}.`);
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Supabase returned an invalid ${label}.`);
  }
  return value;
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`Supabase returned an invalid ${label}.`);
  return value;
}

function requireKind(value: unknown): IntegrationKind {
  if (value !== "email" && value !== "ai" && value !== "whatsapp") {
    throw new Error("Supabase returned an invalid integration kind.");
  }
  return value;
}
