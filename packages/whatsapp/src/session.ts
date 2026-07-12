import { randomUUID } from "node:crypto";

import type { MetadataRecord } from "@reservation-platform/contract-types";

import type { WhatsAppProviderMode } from "./messages.js";

export type WhatsAppSessionStatus = "disabled" | "disconnected" | "pending_qr" | "connected" | "expired";

export interface WhatsAppSessionSnapshot {
  provider: WhatsAppProviderMode;
  status: WhatsAppSessionStatus;
  session_id?: string;
  qr_code?: string;
  connected_at?: string;
  updated_at: string;
  metadata?: MetadataRecord;
}

export interface WhatsAppSessionStartInput {
  provider?: WhatsAppProviderMode;
  tenant_id?: string;
  venue_id?: string;
  metadata?: MetadataRecord;
}

export interface WhatsAppEncryptedSessionRecord {
  session_id: string;
  provider: WhatsAppProviderMode;
  status: WhatsAppSessionStatus;
  encrypted_credentials?: string;
  qr_code?: string;
  connected_at?: string;
  updated_at: string;
  metadata?: MetadataRecord;
}

export interface WhatsAppSessionStore {
  load(): Promise<WhatsAppEncryptedSessionRecord | undefined>;
  save(record: WhatsAppEncryptedSessionRecord): Promise<void>;
  clear(): Promise<void>;
}

export interface WhatsAppSessionAdapter {
  start(input: {
    session_id: string;
    metadata?: MetadataRecord;
  }): Promise<{
    qr_code: string;
    encrypted_credentials?: string;
    metadata?: MetadataRecord;
  }>;
  logout(input: { session_id: string }): Promise<void>;
}

export interface WhatsAppSessionRestoreAdapter {
  restore(input: {
    session_id: string;
    encrypted_credentials?: string;
    metadata?: MetadataRecord;
  }): Promise<{
    status: Exclude<WhatsAppSessionStatus, "disabled">;
    qr_code?: string;
    encrypted_credentials?: string;
    metadata?: MetadataRecord;
  }>;
}

export interface WhatsAppSessionServiceOptions {
  enabled?: boolean;
  provider?: WhatsAppProviderMode;
  store?: WhatsAppSessionStore;
  adapter?: WhatsAppSessionAdapter & Partial<WhatsAppSessionRestoreAdapter>;
  now?: () => Date;
}

export class WhatsAppModuleDisabledError extends Error {
  constructor() {
    super("WhatsApp module is disabled.");
    this.name = "WhatsAppModuleDisabledError";
  }
}

export class WhatsAppSessionNotReadyError extends Error {
  constructor() {
    super("WhatsApp QR session is not ready.");
    this.name = "WhatsAppSessionNotReadyError";
  }
}

export class InMemoryWhatsAppSessionStore implements WhatsAppSessionStore {
  private record: WhatsAppEncryptedSessionRecord | undefined;

  async load() {
    return this.record;
  }

  async save(record: WhatsAppEncryptedSessionRecord) {
    this.record = cloneSessionRecord(record);
  }

  async clear() {
    this.record = undefined;
  }
}

export class PlaceholderWhatsAppQrSessionAdapter implements WhatsAppSessionAdapter {
  async start(input: { session_id: string; metadata?: MetadataRecord }) {
    return {
      qr_code: `reservation-platform:whatsapp-session:${input.session_id}`,
      encrypted_credentials: undefined,
      metadata: {
        adapter: "placeholder-session-qr",
        ...input.metadata,
      },
    };
  }

  async logout() {
    return undefined;
  }
}

export class WhatsAppSessionService {
  private readonly enabled: boolean;
  private readonly provider: WhatsAppProviderMode;
  private readonly store: WhatsAppSessionStore;
  private readonly adapter: WhatsAppSessionAdapter;
  private readonly now: () => Date;

  constructor(options: WhatsAppSessionServiceOptions = {}) {
    this.enabled = options.enabled ?? false;
    this.provider = options.provider ?? "session_qr";
    this.store = options.store ?? new InMemoryWhatsAppSessionStore();
    this.adapter = options.adapter ?? new PlaceholderWhatsAppQrSessionAdapter();
    this.now = options.now ?? (() => new Date());
  }

  async start(input: WhatsAppSessionStartInput = {}): Promise<WhatsAppSessionSnapshot> {
    this.assertEnabled();
    const provider = input.provider ?? this.provider;
    if (provider !== "session_qr") {
      throw new WhatsAppSessionNotReadyError();
    }

    const sessionId = randomUUID();
    const started = await this.adapter.start({
      session_id: sessionId,
      metadata: input.metadata,
    });
    const updatedAt = this.nowIso();
    const record: WhatsAppEncryptedSessionRecord = {
      session_id: sessionId,
      provider,
      status: "pending_qr",
      qr_code: started.qr_code,
      encrypted_credentials: started.encrypted_credentials,
      updated_at: updatedAt,
      metadata: buildSessionMetadata(input, started.metadata),
    };

    await this.store.save(record);
    return sessionSnapshot(record);
  }

  async status(): Promise<WhatsAppSessionSnapshot> {
    if (!this.enabled) {
      return {
        provider: this.provider,
        status: "disabled",
        updated_at: this.nowIso(),
      };
    }

    const record = await this.store.load();
    if (!record) {
      return {
        provider: this.provider,
        status: "disconnected",
        updated_at: this.nowIso(),
      };
    }

    return sessionSnapshot(record);
  }

  async qr(): Promise<WhatsAppSessionSnapshot> {
    this.assertEnabled();
    const record = await this.store.load();
    if (!record || record.status !== "pending_qr" || !record.qr_code) {
      throw new WhatsAppSessionNotReadyError();
    }

    return sessionSnapshot(record);
  }

  async markConnected(credentials: {
    encrypted_credentials?: string;
    metadata?: MetadataRecord;
  } = {}): Promise<WhatsAppSessionSnapshot> {
    this.assertEnabled();
    const record = await this.store.load();
    if (!record) {
      throw new WhatsAppSessionNotReadyError();
    }

    const updatedAt = this.nowIso();
    const connected: WhatsAppEncryptedSessionRecord = {
      ...record,
      status: "connected",
      qr_code: undefined,
      encrypted_credentials: credentials.encrypted_credentials ?? record.encrypted_credentials,
      connected_at: record.connected_at ?? updatedAt,
      updated_at: updatedAt,
      metadata: {
        ...(record.metadata ?? {}),
        ...(credentials.metadata ?? {}),
      },
    };

    await this.store.save(connected);
    return sessionSnapshot(connected);
  }

  async logout(): Promise<WhatsAppSessionSnapshot> {
    this.assertEnabled();
    const record = await this.store.load();
    if (record) {
      await this.adapter.logout({ session_id: record.session_id });
    }

    await this.store.clear();
    return {
      provider: this.provider,
      status: "disconnected",
      updated_at: this.nowIso(),
    };
  }

  async restoreConnection(): Promise<WhatsAppSessionSnapshot> {
    this.assertEnabled();
    const record = await this.store.load();
    if (!record) {
      return {
        provider: this.provider,
        status: "disconnected",
        updated_at: this.nowIso(),
      };
    }
    if (!isRestoreAdapter(this.adapter)) {
      return sessionSnapshot(record);
    }

    const restored = await this.adapter.restore({
      session_id: record.session_id,
      encrypted_credentials: record.encrypted_credentials,
      metadata: record.metadata,
    });
    const updated: WhatsAppEncryptedSessionRecord = {
      ...record,
      status: restored.status,
      qr_code: restored.qr_code,
      encrypted_credentials: restored.encrypted_credentials ?? record.encrypted_credentials,
      connected_at: restored.status === "connected" ? record.connected_at ?? this.nowIso() : record.connected_at,
      updated_at: this.nowIso(),
      metadata: {
        ...(record.metadata ?? {}),
        ...(restored.metadata ?? {}),
      },
    };
    await this.store.save(updated);
    return sessionSnapshot(updated);
  }

  private assertEnabled() {
    if (!this.enabled) {
      throw new WhatsAppModuleDisabledError();
    }
  }

  private nowIso() {
    return this.now().toISOString();
  }
}

function isRestoreAdapter(adapter: WhatsAppSessionAdapter): adapter is WhatsAppSessionAdapter & WhatsAppSessionRestoreAdapter {
  return "restore" in adapter && typeof (adapter as { restore?: unknown }).restore === "function";
}

export function createWhatsAppSessionServiceFromEnv(
  env: Record<string, string | undefined> = process.env,
  options: Omit<WhatsAppSessionServiceOptions, "enabled" | "provider"> = {},
) {
  return new WhatsAppSessionService({
    ...options,
    enabled: parseBooleanEnv(env.RESERVATION_WHATSAPP_ENABLED),
    provider: parseProviderMode(env.RESERVATION_WHATSAPP_PROVIDER),
  });
}

function sessionSnapshot(record: WhatsAppEncryptedSessionRecord): WhatsAppSessionSnapshot {
  return omitUndefined({
    provider: record.provider,
    status: record.status,
    session_id: record.session_id,
    qr_code: record.qr_code,
    connected_at: record.connected_at,
    updated_at: record.updated_at,
    metadata: record.metadata,
  });
}

function parseBooleanEnv(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function parseProviderMode(value: string | undefined): WhatsAppProviderMode {
  return value?.trim() === "meta_cloud" ? "meta_cloud" : "session_qr";
}

function omitUndefined<T extends Record<string, unknown>>(input: T): T {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as T;
}

function buildSessionMetadata(
  input: Pick<WhatsAppSessionStartInput, "tenant_id" | "venue_id">,
  metadata: MetadataRecord | undefined,
): MetadataRecord | undefined {
  const output: MetadataRecord = { ...(metadata ?? {}) };
  if (input.tenant_id) {
    output.tenant_id = input.tenant_id;
  }
  if (input.venue_id) {
    output.venue_id = input.venue_id;
  }

  return Object.keys(output).length > 0 ? output : undefined;
}

function cloneSessionRecord(record: WhatsAppEncryptedSessionRecord): WhatsAppEncryptedSessionRecord {
  return JSON.parse(JSON.stringify(record)) as WhatsAppEncryptedSessionRecord;
}
