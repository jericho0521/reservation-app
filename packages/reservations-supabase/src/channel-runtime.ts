import type { JsonValue } from "@reservation-platform/contract-types";

type QueryResult = { data: unknown; error: unknown | null };

export interface ChannelRuntimeSupabaseClient {
  rpc(name: string, params?: Record<string, unknown>): Promise<QueryResult>;
}

export type WhatsAppChannelCommandKind = "whatsapp.start_session" | "whatsapp.restore_session" | "whatsapp.logout_session";

export function createSupabaseWhatsAppChannelRuntime(client: ChannelRuntimeSupabaseClient) {
  return {
    async enqueue(input: { tenantId: string; venueId?: string; kind: WhatsAppChannelCommandKind; idempotencyKey: string }) {
      const result = await client.rpc("platform_enqueue_whatsapp_command", {
        p_tenant_id: input.tenantId,
        p_venue_id: input.venueId ?? null,
        p_kind: input.kind,
        p_idempotency_key: input.idempotencyKey,
      });
      assertNoError(result.error, "Failed to enqueue WhatsApp command.");
      return asRecord(result.data);
    },
    async readState(tenantId: string) {
      const result = await client.rpc("platform_read_whatsapp_channel_state", { p_tenant_id: tenantId });
      assertNoError(result.error, "Failed to read WhatsApp channel state.");
      return asRecord(result.data);
    },
    async readPairing(tenantId: string) {
      const result = await client.rpc("platform_read_whatsapp_pairing_state", { p_tenant_id: tenantId });
      assertNoError(result.error, "Failed to read WhatsApp pairing state.");
      if (!result.data) return undefined;
      const row = asRecord(result.data);
      return {
        encryptedQr: row.encrypted_qr as JsonValue,
        expiresAt: requiredString(row.expires_at, "WhatsApp pairing expiry"),
      };
    },
    async markCommand(commandId: string, status: "processing" | "completed" | "failed", errorCode?: string) {
      const result = await client.rpc("platform_mark_whatsapp_command", {
        p_command_id: commandId,
        p_status: status,
        p_error_code: errorCode ?? null,
      });
      assertNoError(result.error, "Failed to update WhatsApp command.");
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("WhatsApp channel state is invalid.");
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is invalid.`);
  return value;
}

function assertNoError(error: unknown, message: string) {
  if (error) throw new Error(message);
}
