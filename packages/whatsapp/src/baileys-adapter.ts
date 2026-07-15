import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import type { MetadataRecord } from "@reservation-platform/contract-types";

import { decryptJson, encryptJson } from "./crypto.js";
import type { WhatsAppInboundMessage, WhatsAppOutboundMessage } from "./messages.js";
import type { WhatsAppSessionAdapter } from "./session.js";

export interface BaileysWhatsAppSessionAdapterOptions {
  authDirectory: string;
  qrTimeoutMs?: number;
  maxReconnectAttempts?: number;
  sessionEncryptionKey?: string;
  requireEncryptedCredentials?: boolean;
  onInboundMessage?: (message: WhatsAppInboundMessage) => void | Promise<void>;
  onStatusChange?: (status: "pending_qr" | "connected" | "disconnected" | "expired", metadata?: MetadataRecord) => void | Promise<void>;
}

export interface BaileysSessionCredentials {
  auth_directory: string;
}

export function serializeBaileysSessionCredentials(authDirectory: string, encryptionKey?: string): string {
  const credentials: BaileysSessionCredentials = { auth_directory: authDirectory };
  return encryptionKey ? encryptJson(credentials, encryptionKey) : JSON.stringify(credentials);
}

export function deserializeBaileysSessionCredentials(
  payload: string,
  encryptionKey?: string,
): BaileysSessionCredentials {
  const credentials = encryptionKey ? decryptJson<unknown>(payload, encryptionKey) : JSON.parse(payload) as unknown;
  if (
    typeof credentials !== "object"
    || credentials === null
    || typeof (credentials as { auth_directory?: unknown }).auth_directory !== "string"
    || !(credentials as { auth_directory: string }).auth_directory
  ) {
    throw new Error("WhatsApp session credentials are invalid.");
  }
  return credentials as BaileysSessionCredentials;
}

export class BaileysWhatsAppSessionAdapter implements WhatsAppSessionAdapter {
  private socket: unknown;
  private readonly authDirectory: string;
  private readonly qrTimeoutMs: number;
  private readonly maxReconnectAttempts: number;
  private readonly sessionEncryptionKey?: string;
  private readonly onInboundMessage?: BaileysWhatsAppSessionAdapterOptions["onInboundMessage"];
  private readonly onStatusChange?: BaileysWhatsAppSessionAdapterOptions["onStatusChange"];

  constructor(options: BaileysWhatsAppSessionAdapterOptions) {
    this.authDirectory = options.authDirectory;
    this.qrTimeoutMs = options.qrTimeoutMs ?? 60_000;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 5;
    this.sessionEncryptionKey = options.sessionEncryptionKey?.trim() || undefined;
    if (options.requireEncryptedCredentials === true && !this.sessionEncryptionKey) {
      throw new Error("WhatsApp session encryption key is required.");
    }
    this.onInboundMessage = options.onInboundMessage;
    this.onStatusChange = options.onStatusChange;
  }

  async start(input: { session_id: string; metadata?: MetadataRecord }) {
    const baileys = await import("@whiskeysockets/baileys");
    const makeWASocket = (baileys.default ?? baileys.makeWASocket) as unknown as (options: Record<string, unknown>) => BaileysSocket;
    const useMultiFileAuthState = baileys.useMultiFileAuthState as unknown as (
      folder: string,
    ) => Promise<{ state: unknown; saveCreds: () => Promise<void> }>;

    const sessionDirectory = path.join(this.authDirectory, input.session_id);
    await mkdir(sessionDirectory, { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(sessionDirectory);

    return new Promise<{
      qr_code: string;
      encrypted_credentials?: string;
      metadata?: MetadataRecord;
    }>((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error("Timed out waiting for WhatsApp QR."));
        }
      }, this.qrTimeoutMs);

      const connect = (attempt = 0) => {
        const socket = makeWASocket({
          auth: state,
          browser: ["Reservation Platform", "Chrome", "1.0.0"],
        });
        this.socket = socket;

        socket.ev.on("creds.update", saveCreds);
        socket.ev.on("connection.update", async (update: BaileysConnectionUpdate) => {
          if (update.qr && !settled) {
            settled = true;
            clearTimeout(timeout);
            await this.emitStatusChange("pending_qr", { session_id: input.session_id });
            resolve({
              qr_code: update.qr,
              encrypted_credentials: serializeBaileysSessionCredentials(sessionDirectory, this.sessionEncryptionKey),
              metadata: {
                adapter: "baileys",
                session_storage: "multi-file",
                ...input.metadata,
              },
            });
            return;
          }

          if (update.connection === "open") {
            clearTimeout(timeout);
            await this.emitStatusChange("connected", { session_id: input.session_id });
            return;
          }

          if (update.connection === "close") {
            const disconnectStatus = readDisconnectStatus(update);
            if (disconnectStatus === 401) {
              await this.emitStatusChange("expired", {
                session_id: input.session_id,
                ...(disconnectStatus === undefined ? {} : { disconnect_status: disconnectStatus }),
              });
              if (!settled) {
                settled = true;
                clearTimeout(timeout);
                reject(new Error("WhatsApp session was logged out before QR pairing completed."));
              }
              return;
            }

            const nextAttempt = nextBaileysReconnectAttempt(attempt, this.maxReconnectAttempts, disconnectStatus);
            if (nextAttempt !== undefined) {
              console.log(`WhatsApp connection closed; reconnecting (${nextAttempt}/${this.maxReconnectAttempts})...`);
              setTimeout(() => connect(nextAttempt), reconnectDelayMs(nextAttempt));
              return;
            }

            await this.emitStatusChange("disconnected", {
              session_id: input.session_id,
              ...(disconnectStatus === undefined ? {} : { disconnect_status: disconnectStatus }),
              reconnect_attempts: attempt,
            });
            if (!settled) {
              settled = true;
              clearTimeout(timeout);
              reject(new Error("WhatsApp session disconnected before QR pairing completed."));
            }
          }
        });

        socket.ev.on("messages.upsert", async (event: BaileysMessagesUpsert) => {
          for (const message of event.messages ?? []) {
            const normalized = normalizeBaileysMessage(message);
            if (normalized) {
              await this.onInboundMessage?.(normalized);
            }
          }
        });
      };

      connect();
    });
  }

  async restore(input: { session_id: string; encrypted_credentials?: string; metadata?: MetadataRecord }) {
    const baileys = await import("@whiskeysockets/baileys");
    const makeWASocket = (baileys.default ?? baileys.makeWASocket) as unknown as (options: Record<string, unknown>) => BaileysSocket;
    const useMultiFileAuthState = baileys.useMultiFileAuthState as unknown as (
      folder: string,
    ) => Promise<{ state: unknown; saveCreds: () => Promise<void> }>;

    const sessionDirectory = input.encrypted_credentials
      ? deserializeBaileysSessionCredentials(input.encrypted_credentials, this.sessionEncryptionKey).auth_directory
      : path.join(this.authDirectory, input.session_id);
    await mkdir(sessionDirectory, { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(sessionDirectory);

    return new Promise<{
      status: "pending_qr" | "connected" | "disconnected" | "expired";
      qr_code?: string;
      encrypted_credentials?: string;
      metadata?: MetadataRecord;
    }>((resolve) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve({
            status: "disconnected",
            metadata: { adapter: "baileys", session_storage: "multi-file", restore_timeout: true },
          });
        }
      }, this.qrTimeoutMs);

      const connect = (attempt = 0) => {
        const socket = makeWASocket({
          auth: state,
          browser: ["Reservation Platform", "Chrome", "1.0.0"],
        });
        this.socket = socket;

        socket.ev.on("creds.update", saveCreds);
        socket.ev.on("connection.update", async (update: BaileysConnectionUpdate) => {
          if (update.qr && !settled) {
            settled = true;
            clearTimeout(timeout);
            await this.emitStatusChange("pending_qr", { session_id: input.session_id });
            resolve({
              status: "pending_qr",
              qr_code: update.qr,
              encrypted_credentials: serializeBaileysSessionCredentials(sessionDirectory, this.sessionEncryptionKey),
              metadata: { adapter: "baileys", session_storage: "multi-file", ...input.metadata },
            });
            return;
          }

          if (update.connection === "open") {
            await this.emitStatusChange("connected", { session_id: input.session_id });
            if (!settled) {
              settled = true;
              clearTimeout(timeout);
              resolve({
                status: "connected",
                encrypted_credentials: serializeBaileysSessionCredentials(sessionDirectory, this.sessionEncryptionKey),
                metadata: { adapter: "baileys", session_storage: "multi-file", restored: true, ...input.metadata },
              });
            }
            return;
          }

          if (update.connection === "close") {
            const disconnectStatus = readDisconnectStatus(update);
            if (disconnectStatus === 401) {
              clearTimeout(timeout);
              await this.emitStatusChange("expired", { session_id: input.session_id, disconnect_status: disconnectStatus });
              if (!settled) {
                settled = true;
                resolve({
                  status: "expired",
                  metadata: { adapter: "baileys", session_storage: "multi-file", disconnect_status: disconnectStatus },
                });
              }
              return;
            }

            const nextAttempt = nextBaileysReconnectAttempt(attempt, this.maxReconnectAttempts, disconnectStatus);
            if (nextAttempt !== undefined) {
              setTimeout(() => connect(nextAttempt), reconnectDelayMs(nextAttempt));
              return;
            }

            if (!settled) {
              settled = true;
              clearTimeout(timeout);
              await this.emitStatusChange("disconnected", {
                session_id: input.session_id,
                ...(disconnectStatus === undefined ? {} : { disconnect_status: disconnectStatus }),
                reconnect_attempts: attempt,
              });
              resolve({
                status: "disconnected",
                metadata: {
                  adapter: "baileys",
                  session_storage: "multi-file",
                  ...(disconnectStatus === undefined ? {} : { disconnect_status: disconnectStatus }),
                  reconnect_attempts: attempt,
                },
              });
            }
          }
        });

        socket.ev.on("messages.upsert", async (event: BaileysMessagesUpsert) => {
          for (const message of event.messages ?? []) {
            const normalized = normalizeBaileysMessage(message);
            if (normalized) {
              await this.onInboundMessage?.(normalized);
            }
          }
        });
      };

      connect();
    });
  }

  async sendMessage(input: WhatsAppOutboundMessage) {
    await this.deliverMessage(input);
  }

  async deliverMessage(input: WhatsAppOutboundMessage) {
    const socket = this.socket as BaileysSocket | undefined;
    if (!socket) {
      throw new Error("WhatsApp session is not connected.");
    }

    const result = await socket.sendMessage(input.to, { text: input.text });
    return { providerMessageId: baileysProviderMessageId(result) };
  }

  async logout() {
    const socket = this.socket as BaileysSocket | undefined;
    await socket?.logout?.();
    this.socket = undefined;
  }

  private async emitStatusChange(
    status: "pending_qr" | "connected" | "disconnected" | "expired",
    metadata?: MetadataRecord,
  ) {
    try {
      await this.onStatusChange?.(status, metadata);
    } catch (error) {
      console.error("WhatsApp status change handler failed.", error);
    }
  }
}

export function baileysProviderMessageId(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const key = (value as { key?: unknown }).key;
  if (!key || typeof key !== "object" || Array.isArray(key)) return undefined;
  const id = (key as { id?: unknown }).id;
  return typeof id === "string" && id.length > 0 ? id : undefined;
}

interface BaileysSocket {
  ev: {
    on(event: string, handler: (...args: never[]) => unknown): void;
  };
  sendMessage(to: string, message: { text: string }): Promise<unknown>;
  logout?: () => Promise<void>;
}

interface BaileysConnectionUpdate {
  qr?: string;
  connection?: "open" | "close" | "connecting";
  lastDisconnect?: {
    error?: {
      message?: string;
      output?: {
        statusCode?: number;
        payload?: {
          statusCode?: number;
          error?: string;
          message?: string;
        };
      };
    };
  };
}

interface BaileysMessagesUpsert {
  messages?: BaileysMessage[];
}

interface BaileysMessage {
  key?: {
    id?: string;
    remoteJid?: string;
    fromMe?: boolean;
  };
  message?: {
    conversation?: string;
    extendedTextMessage?: {
      text?: string;
    };
  };
  messageTimestamp?: number;
  pushName?: string;
}

export function normalizeBaileysMessage(message: BaileysMessage): WhatsAppInboundMessage | null {
  if (message.key?.fromMe) {
    return null;
  }

  const text = message.message?.conversation ?? message.message?.extendedTextMessage?.text;
  const remoteJid = message.key?.remoteJid;
  if (!remoteJid) {
    return null;
  }

  return {
    provider: "session_qr",
    messageId: message.key?.id ?? stableBaileysMessageId(remoteJid, text ?? "[unsupported]", message.messageTimestamp),
    from: {
      id: remoteJid,
      displayName: message.pushName,
      phoneNumber: remoteJid.split("@")[0],
    },
    ...(text ? { text } : {}),
    timestamp: message.messageTimestamp === undefined
      ? undefined
      : new Date(Number(message.messageTimestamp) * 1000).toISOString(),
    raw: {
      remote_jid: remoteJid,
    },
  };
}

function stableBaileysMessageId(remoteJid: string, text: string, timestamp: number | undefined) {
  return `baileys:${createHash("sha256").update(`${remoteJid}\u0000${timestamp ?? ""}\u0000${text}`).digest("hex")}`;
}

function readDisconnectStatus(update: BaileysConnectionUpdate) {
  return update.lastDisconnect?.error?.output?.statusCode
    ?? update.lastDisconnect?.error?.output?.payload?.statusCode;
}

function reconnectDelayMs(attempt: number) {
  return Math.min(500 * attempt, 3_000);
}

export function nextBaileysReconnectAttempt(attempt: number, maximum: number, disconnectStatus?: number) {
  return disconnectStatus === 401 || attempt >= maximum ? undefined : attempt + 1;
}
