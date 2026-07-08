import { mkdir } from "node:fs/promises";
import path from "node:path";

import type { MetadataRecord } from "@reservation-platform/contract-types";

import type { WhatsAppInboundMessage, WhatsAppOutboundMessage } from "./messages.js";
import type { WhatsAppSessionAdapter } from "./session.js";

export interface BaileysWhatsAppSessionAdapterOptions {
  authDirectory: string;
  qrTimeoutMs?: number;
  printQrInTerminal?: boolean;
  maxReconnectAttempts?: number;
  onInboundMessage?: (message: WhatsAppInboundMessage) => void | Promise<void>;
  onStatusChange?: (status: "pending_qr" | "connected" | "disconnected" | "expired", metadata?: MetadataRecord) => void | Promise<void>;
}

export class BaileysWhatsAppSessionAdapter implements WhatsAppSessionAdapter {
  private socket: unknown;
  private readonly authDirectory: string;
  private readonly qrTimeoutMs: number;
  private readonly printQrInTerminal: boolean;
  private readonly maxReconnectAttempts: number;
  private readonly onInboundMessage?: BaileysWhatsAppSessionAdapterOptions["onInboundMessage"];
  private readonly onStatusChange?: BaileysWhatsAppSessionAdapterOptions["onStatusChange"];

  constructor(options: BaileysWhatsAppSessionAdapterOptions) {
    this.authDirectory = options.authDirectory;
    this.qrTimeoutMs = options.qrTimeoutMs ?? 60_000;
    this.printQrInTerminal = options.printQrInTerminal ?? true;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 5;
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
            if (this.printQrInTerminal) {
              await printTerminalQr(update.qr);
              console.log("");
              console.log("WhatsApp login QR is ready.");
              console.log("Scan the QR above in WhatsApp: Settings > Linked devices > Link a device.");
              console.log(`QR payload: ${update.qr}`);
              console.log("");
            }
            await this.emitStatusChange("pending_qr", { session_id: input.session_id });
            resolve({
              qr_code: update.qr,
              encrypted_credentials: JSON.stringify({ auth_directory: sessionDirectory }),
              metadata: {
                adapter: "baileys",
                auth_directory: sessionDirectory,
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

            if (attempt < this.maxReconnectAttempts) {
              const nextAttempt = attempt + 1;
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

  async restore(input: { session_id: string; metadata?: MetadataRecord }) {
    const baileys = await import("@whiskeysockets/baileys");
    const makeWASocket = (baileys.default ?? baileys.makeWASocket) as unknown as (options: Record<string, unknown>) => BaileysSocket;
    const useMultiFileAuthState = baileys.useMultiFileAuthState as unknown as (
      folder: string,
    ) => Promise<{ state: unknown; saveCreds: () => Promise<void> }>;

    const sessionDirectory = path.join(this.authDirectory, input.session_id);
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
            metadata: { adapter: "baileys", auth_directory: sessionDirectory, restore_timeout: true },
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
              encrypted_credentials: JSON.stringify({ auth_directory: sessionDirectory }),
              metadata: { adapter: "baileys", auth_directory: sessionDirectory, ...input.metadata },
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
                encrypted_credentials: JSON.stringify({ auth_directory: sessionDirectory }),
                metadata: { adapter: "baileys", auth_directory: sessionDirectory, restored: true, ...input.metadata },
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
                  metadata: { adapter: "baileys", auth_directory: sessionDirectory, disconnect_status: disconnectStatus },
                });
              }
              return;
            }

            if (attempt < this.maxReconnectAttempts) {
              const nextAttempt = attempt + 1;
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
                  auth_directory: sessionDirectory,
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
    const socket = this.socket as BaileysSocket | undefined;
    if (!socket) {
      throw new Error("WhatsApp session is not connected.");
    }

    await socket.sendMessage(input.to, { text: input.text });
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

function normalizeBaileysMessage(message: BaileysMessage): WhatsAppInboundMessage | null {
  if (message.key?.fromMe) {
    return null;
  }

  const text = message.message?.conversation ?? message.message?.extendedTextMessage?.text;
  const remoteJid = message.key?.remoteJid;
  if (!remoteJid || !text) {
    return null;
  }

  return {
    provider: "session_qr",
    messageId: message.key?.id ?? `${remoteJid}:${Date.now()}`,
    from: {
      id: remoteJid,
      displayName: message.pushName,
      phoneNumber: remoteJid.split("@")[0],
    },
    text,
    timestamp: message.messageTimestamp === undefined
      ? undefined
      : new Date(Number(message.messageTimestamp) * 1000).toISOString(),
    raw: {
      remote_jid: remoteJid,
    },
  };
}

async function printTerminalQr(qrCode: string) {
  try {
    const qrTerminal = await import("qrcode-terminal");
    const renderer = qrTerminal.default ?? qrTerminal;
    renderer.generate(qrCode, { small: true });
  } catch (error) {
    console.warn("Could not render WhatsApp QR in terminal.", error);
  }
}

function readDisconnectStatus(update: BaileysConnectionUpdate) {
  return update.lastDisconnect?.error?.output?.statusCode
    ?? update.lastDisconnect?.error?.output?.payload?.statusCode;
}

function reconnectDelayMs(attempt: number) {
  return Math.min(500 * attempt, 3_000);
}
