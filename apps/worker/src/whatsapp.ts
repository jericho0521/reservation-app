import {
  BaileysWhatsAppSessionAdapter,
  SupabaseWhatsAppModuleStore,
  WhatsAppSessionService,
  type WhatsAppInboundMessage,
  type WhatsAppOutboundMessage,
  type WhatsAppSessionSnapshot,
  type WhatsAppSessionStartInput,
} from "@reservation-platform/whatsapp";
import { decryptSecretEnvelope, encryptSecretEnvelope } from "@reservation-platform/platform-config";
import type { PlatformJobRepository } from "@reservation-platform/api";
import { createSupabaseWhatsAppChannelRuntime } from "@project-play/reservations-supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { PlatformJobHandler, WorkerPlatformJob } from "./runtime.js";

const defaultPairingTtlMs = 60_000;

export interface WhatsAppWorkerSession {
  startSession(input: WhatsAppSessionStartInput): Promise<WhatsAppSessionSnapshot>;
  restoreSessionConnection(): Promise<WhatsAppSessionSnapshot>;
  logoutSession(): Promise<WhatsAppSessionSnapshot>;
}

export interface WhatsAppWorkerStateStore {
  saveSessionSnapshot(snapshot: WhatsAppSessionSnapshot): Promise<void>;
  savePairing(input: {
    tenantId: string;
    sessionId: string;
    encryptedQr: string;
    expiresAt: string;
  }): Promise<void>;
  clearPairing(tenantId: string): Promise<void>;
  markCommand(commandId: string, status: "processing" | "completed" | "failed", errorCode?: string): Promise<void>;
  persistInbound(message: WhatsAppInboundMessage): Promise<{
    inserted: boolean;
    conversationId?: string;
    messageId?: string;
    automationStatus?: "automated" | "manual";
  }>;
  enqueueConversation(input: {
    tenantId: string;
    venueId?: string;
    conversationId: string;
    messageId: string;
  }): Promise<void>;
  claimOutbound(outboxId: string): Promise<WhatsAppOutboundDelivery | undefined>;
  markOutboundDelivered(outboxId: string, providerMessageId?: string): Promise<void>;
  releaseOutbound(outboxId: string, errorCode: string): Promise<void>;
}

export interface WhatsAppOutboundDelivery {
  message: WhatsAppOutboundMessage;
}

export interface WhatsAppWorkerSender {
  send(message: WhatsAppOutboundMessage): Promise<{ providerMessageId?: string } | void>;
}

export interface WhatsAppWorkerJobHandlerOptions {
  session: WhatsAppWorkerSession;
  state: WhatsAppWorkerStateStore;
  sender: WhatsAppWorkerSender;
  sessionEncryptionKey: string;
  pairingTtlMs?: number;
  now?: () => Date;
}

export interface ProductionWhatsAppRuntime {
  handlers: Readonly<Record<string, PlatformJobHandler>>;
  enqueueRestore(): Promise<void>;
}

export function createProductionWhatsAppRuntime(input: {
  client: SupabaseClient;
  jobs: PlatformJobRepository;
  sessionEncryptionKey: string;
  authDirectory: string;
}): ProductionWhatsAppRuntime {
  const key = requiredSessionEncryptionKey(input.sessionEncryptionKey);
  if (!input.authDirectory.trim()) throw new Error("RESERVATION_WHATSAPP_SESSION_AUTH_DIR is required by the WhatsApp worker.");
  const store = new SupabaseWhatsAppModuleStore(
    input.client as unknown as ConstructorParameters<typeof SupabaseWhatsAppModuleStore>[0],
    { requireEncryptedCredentials: true },
  );
  const state = new SupabaseWhatsAppWorkerStateStore(input.client, input.jobs);
  let service: WhatsAppSessionService;
  const adapter = new BaileysWhatsAppSessionAdapter({
    authDirectory: input.authDirectory.trim(),
    sessionEncryptionKey: key,
    requireEncryptedCredentials: true,
    async onInboundMessage(message) {
      const scope = await currentScope(store);
      if (!scope) throw workerError("whatsapp_scope_unavailable");
      await input.jobs.enqueue({
        tenantId: scope.tenantId,
        ...(scope.venueId ? { venueId: scope.venueId } : {}),
        kind: "whatsapp.process_inbound",
        payload: { message },
        maxAttempts: 5,
        idempotencyKey: `whatsapp:inbound:${message.messageId}`,
      });
    },
    async onStatusChange(status, metadata) {
      const record = await store.load();
      if (!record) return;
      await store.save({
        ...record,
        status,
        qr_code: undefined,
        updated_at: new Date().toISOString(),
        metadata: { ...(record.metadata ?? {}), ...(metadata ?? {}) },
      });
      const scope = await currentScope(store);
      if (scope && status !== "pending_qr") await state.clearPairing(scope.tenantId);
    },
  });
  service = new WhatsAppSessionService({
    enabled: true,
    provider: "session_qr",
    store,
    adapter,
    persistQrCode: false,
  });
  const handlers = createWhatsAppJobHandlers({
    sessionEncryptionKey: key,
    session: {
      startSession: (value) => service.start(value),
      restoreSessionConnection: () => service.restoreConnection(),
      logoutSession: () => service.logout(),
    },
    state,
    sender: { send: (message) => adapter.deliverMessage(message) },
  });
  return {
    handlers,
    async enqueueRestore() {
      const record = await store.load();
      const scope = await currentScope(store);
      if (!record || !scope) return;
      await input.jobs.enqueue({
        tenantId: scope.tenantId,
        ...(scope.venueId ? { venueId: scope.venueId } : {}),
        kind: "whatsapp.restore_session",
        payload: { sessionId: record.session_id },
        maxAttempts: 5,
        idempotencyKey: `whatsapp:restore:${record.session_id}:${record.updated_at}`,
      });
    },
  };
}

export function createWhatsAppJobHandlers(
  options: WhatsAppWorkerJobHandlerOptions,
): Readonly<Record<string, PlatformJobHandler>> {
  const encryptionKey = requiredSessionEncryptionKey(options.sessionEncryptionKey);
  const now = options.now ?? (() => new Date());
  const pairingTtlMs = options.pairingTtlMs ?? defaultPairingTtlMs;

  return {
    "whatsapp.start_session": (job) => runCommand(options.state, job, async () => {
      const snapshot = await options.session.startSession(sessionStartInput(job));
      await persistSessionSnapshot(options.state, snapshot, job.tenantId, encryptionKey, now, pairingTtlMs);
    }),
    "whatsapp.restore_session": (job) => runCommand(options.state, job, async () => {
      const snapshot = await options.session.restoreSessionConnection();
      await persistSessionSnapshot(options.state, snapshot, job.tenantId, encryptionKey, now, pairingTtlMs);
    }),
    "whatsapp.logout_session": (job) => runCommand(options.state, job, async () => {
      await options.session.logoutSession();
      await options.state.clearPairing(job.tenantId);
    }),
    "whatsapp.process_inbound": async (job) => {
      const message = inboundMessage(job.payload.message);
      const persisted = await options.state.persistInbound(message);
      if (!persisted.inserted || persisted.automationStatus === "manual" || !persisted.conversationId || !persisted.messageId) return;
      await options.state.enqueueConversation({
        tenantId: job.tenantId,
        ...(job.venueId ? { venueId: job.venueId } : {}),
        conversationId: persisted.conversationId,
        messageId: persisted.messageId,
      });
    },
    "whatsapp.deliver_outbound": async (job) => {
      const outboxId = requiredPayloadString(job, "outboxId");
      const delivery = await options.state.claimOutbound(outboxId);
      if (!delivery) return;
      try {
        const result = await options.sender.send(delivery.message);
        const providerMessageId = result?.providerMessageId;
        await options.state.markOutboundDelivered(outboxId, providerMessageId);
        return providerMessageId ? { providerMessageId } : undefined;
      } catch (error) {
        await options.state.releaseOutbound(outboxId, errorCode(error));
        throw error;
      }
    },
  };
}

export function encryptWhatsAppPairingQr(qr: string, secret: string): string {
  return JSON.stringify(encryptSecretEnvelope({ qr }, requiredSessionEncryptionKey(secret)));
}

export function decryptWhatsAppPairingQr(payload: string, secret: string): string {
  const value = decryptSecretEnvelope<unknown>(JSON.parse(payload), requiredSessionEncryptionKey(secret));
  if (!value || typeof value !== "object" || Array.isArray(value)
    || typeof (value as { qr?: unknown }).qr !== "string"
    || !(value as { qr: string }).qr) {
    throw new Error("WhatsApp pairing QR payload is invalid.");
  }
  return (value as { qr: string }).qr;
}

async function persistSessionSnapshot(
  state: WhatsAppWorkerStateStore,
  snapshot: WhatsAppSessionSnapshot,
  tenantId: string,
  encryptionKey: string,
  now: () => Date,
  pairingTtlMs: number,
) {
  await state.saveSessionSnapshot({ ...snapshot, qr_code: undefined });
  if (!snapshot.qr_code || !snapshot.session_id) {
    if (snapshot.status === "connected" || snapshot.status === "expired" || snapshot.status === "disconnected") {
      await state.clearPairing(tenantId);
    }
    return;
  }
  await state.savePairing({
    tenantId,
    sessionId: snapshot.session_id,
    encryptedQr: encryptWhatsAppPairingQr(snapshot.qr_code, encryptionKey),
    expiresAt: new Date(now().getTime() + pairingTtlMs).toISOString(),
  });
}

function sessionStartInput(job: WorkerPlatformJob): WhatsAppSessionStartInput {
  return {
    provider: "session_qr",
    tenant_id: job.tenantId,
    ...(job.venueId ? { venue_id: job.venueId } : {}),
  };
}

function inboundMessage(value: unknown): WhatsAppInboundMessage {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalidPayload();
  const candidate = value as Partial<WhatsAppInboundMessage>;
  if ((candidate.provider !== "session_qr" && candidate.provider !== "meta_cloud")
    || typeof candidate.messageId !== "string" || !candidate.messageId
    || !candidate.from || typeof candidate.from !== "object"
    || typeof candidate.from.id !== "string" || !candidate.from.id) {
    throw invalidPayload();
  }
  return candidate as WhatsAppInboundMessage;
}

function requiredPayloadString(job: WorkerPlatformJob, key: string) {
  const value = job.payload[key];
  if (typeof value !== "string" || !value.trim()) throw invalidPayload();
  return value;
}

async function runCommand(state: WhatsAppWorkerStateStore, job: WorkerPlatformJob, action: () => Promise<void>) {
  const commandId = typeof job.payload.commandId === "string" && job.payload.commandId.trim()
    ? job.payload.commandId.trim()
    : undefined;
  if (commandId) await state.markCommand(commandId, "processing");
  try {
    await action();
    if (commandId) await state.markCommand(commandId, "completed");
  } catch (error) {
    if (commandId) await state.markCommand(commandId, "failed", errorCode(error));
    throw error;
  }
}

function requiredSessionEncryptionKey(value: string) {
  const normalized = value.trim();
  if (normalized.length < 16) throw new Error("RESERVATION_WHATSAPP_SESSION_ENCRYPTION_KEY is required by the WhatsApp worker and must be at least 16 characters.");
  return normalized;
}

function invalidPayload() {
  const error = new Error("WhatsApp job payload is invalid.") as Error & { code: string };
  error.code = "invalid_job_payload";
  return error;
}

function errorCode(error: unknown) {
  return error && typeof error === "object" && "code" in error && typeof error.code === "string"
    ? error.code
    : "whatsapp_delivery_failed";
}

class SupabaseWhatsAppWorkerStateStore implements WhatsAppWorkerStateStore {
  private readonly channelRuntime;

  constructor(
    private readonly client: SupabaseClient,
    private readonly jobs: PlatformJobRepository,
  ) {
    this.channelRuntime = createSupabaseWhatsAppChannelRuntime(client as unknown as Parameters<typeof createSupabaseWhatsAppChannelRuntime>[0]);
  }

  async saveSessionSnapshot(snapshot: WhatsAppSessionSnapshot) {
    if (!snapshot.session_id) return;
    const result = await this.client
      .from("platform_whatsapp_sessions")
      .update({
        status: snapshot.status,
        connected_at: snapshot.connected_at ?? null,
        updated_at: snapshot.updated_at,
        metadata: snapshot.metadata ?? {},
        qr_code: null,
      })
      .eq("id", snapshot.session_id);
    assertSupabase(result.error, "Failed to save WhatsApp session state.");
  }

  async savePairing(input: { tenantId: string; sessionId: string; encryptedQr: string; expiresAt: string }) {
    const encryptedQr = parseEncryptedQr(input.encryptedQr);
    const result = await this.client
      .from("platform_whatsapp_pairing_state")
      .upsert({ tenant_id: input.tenantId, encrypted_qr: encryptedQr, expires_at: input.expiresAt }, { onConflict: "tenant_id" });
    assertSupabase(result.error, "Failed to save WhatsApp pairing state.");
  }

  async clearPairing(tenantId: string) {
    const result = await this.client.from("platform_whatsapp_pairing_state").delete().eq("tenant_id", tenantId);
    assertSupabase(result.error, "Failed to clear WhatsApp pairing state.");
  }

  async markCommand(commandId: string, status: "processing" | "completed" | "failed", errorCode?: string) {
    await this.channelRuntime.markCommand(commandId, status, errorCode);
  }

  async persistInbound(message: WhatsAppInboundMessage) {
    const record = await this.sessionScope();
    if (!record?.venueId) throw workerError("whatsapp_scope_unavailable");
    const conversationResult = await this.client
      .from("platform_conversations")
      .upsert({
        tenant_id: record.tenantId,
        venue_id: record.venueId,
        channel: "whatsapp",
        channel_thread_id: message.from.id,
        metadata: { provider: message.provider },
      }, { onConflict: "tenant_id,venue_id,channel,channel_thread_id" })
      .select("id, automation_state")
      .single();
    assertSupabase(conversationResult.error, "Failed to persist WhatsApp conversation.");
    const conversation = recordValue(conversationResult.data, "WhatsApp conversation");
    const conversationId = requiredString(conversation.id, "WhatsApp conversation id");
    const appendResult = await this.client.rpc("append_platform_conversation_message", {
      p_tenant_id: record.tenantId,
      p_venue_id: record.venueId,
      p_conversation_id: conversationId,
      p_channel: "whatsapp",
      p_direction: "inbound",
      p_sender_type: "customer",
      p_delivery_state: "delivered",
      p_external_message_id: message.messageId,
      p_content: message.text?.trim() || "Unsupported WhatsApp message received.",
      p_reservation_id: null,
      p_metadata: { provider: message.provider },
    });
    assertSupabase(appendResult.error, "Failed to persist WhatsApp inbound message.");
    const persistedMessage = recordValue(appendResult.data, "WhatsApp inbound message");
    return {
      inserted: true,
      conversationId,
      messageId: requiredString(persistedMessage.id, "WhatsApp inbound message id"),
      automationStatus: conversation.automation_state === "manual" ? "manual" as const : "automated" as const,
    };
  }

  async enqueueConversation(input: { tenantId: string; venueId?: string; conversationId: string; messageId: string }) {
    await this.jobs.enqueue({
      tenantId: input.tenantId,
      ...(input.venueId ? { venueId: input.venueId } : {}),
      kind: "conversation.process_ai",
      payload: { conversationId: input.conversationId, messageId: input.messageId },
      maxAttempts: 5,
      idempotencyKey: `conversation:whatsapp:${input.messageId}`,
    });
  }

  async claimOutbound(outboxId: string) {
    const result = await this.client.rpc("platform_claim_whatsapp_outbox", { p_outbox_id: outboxId });
    assertSupabase(result.error, "Failed to claim WhatsApp outbound message.");
    if (!result.data) return undefined;
    const row = recordValue(result.data, "WhatsApp outbox message");
    return {
      message: {
        provider: "session_qr" as const,
        to: requiredString(row.target, "WhatsApp outbox target"),
        text: requiredString(row.content, "WhatsApp outbox content"),
      },
    };
  }

  async markOutboundDelivered(outboxId: string, providerMessageId?: string) {
    const result = await this.client.rpc("platform_complete_whatsapp_outbox", {
      p_outbox_id: outboxId,
      p_provider_message_id: providerMessageId ?? null,
    });
    assertSupabase(result.error, "Failed to complete WhatsApp outbound message.");
  }

  async releaseOutbound(outboxId: string, code: string) {
    const result = await this.client.rpc("platform_release_whatsapp_outbox", {
      p_outbox_id: outboxId,
      p_error_code: safeErrorCode(code),
    });
    assertSupabase(result.error, "Failed to release WhatsApp outbound message.");
  }

  private async sessionScope() {
    const result = await this.client.from("platform_whatsapp_sessions").select("metadata").limit(1).maybeSingle();
    assertSupabase(result.error, "Failed to read WhatsApp session scope.");
    if (!result.data) return undefined;
    const metadata = recordValue(recordValue(result.data, "WhatsApp session").metadata, "WhatsApp session metadata");
    return {
      tenantId: requiredString(metadata.tenant_id, "WhatsApp tenant id"),
      venueId: typeof metadata.venue_id === "string" && metadata.venue_id ? metadata.venue_id : undefined,
    };
  }
}

async function currentScope(store: SupabaseWhatsAppModuleStore) {
  const record = await store.load();
  if (!record?.metadata) return undefined;
  const tenantId = record.metadata.tenant_id;
  const venueId = record.metadata.venue_id;
  return typeof tenantId === "string" && tenantId
    ? { tenantId, venueId: typeof venueId === "string" && venueId ? venueId : undefined }
    : undefined;
}

function parseEncryptedQr(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch {
    // Fall through to a safe storage error.
  }
  throw workerError("invalid_pairing_envelope");
}

function recordValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} is invalid.`);
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is invalid.`);
  return value;
}

function assertSupabase(error: unknown, message: string) {
  if (error) throw new Error(message);
}

function safeErrorCode(value: string) {
  return /^[a-z][a-z0-9_]{0,63}$/u.test(value) ? value : "whatsapp_delivery_failed";
}

function workerError(code: string) {
  const error = new Error("WhatsApp worker state is unavailable.") as Error & { code: string };
  error.code = code;
  return error;
}
