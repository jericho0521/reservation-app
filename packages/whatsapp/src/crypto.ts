import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const algorithm = "aes-256-gcm";

export interface EncryptedPayload {
  algorithm: "aes-256-gcm";
  iv: string;
  tag: string;
  ciphertext: string;
}

export function isEncryptedPayload(value: unknown): value is EncryptedPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const payload = value as Partial<EncryptedPayload>;
  return payload.algorithm === algorithm
    && typeof payload.iv === "string" && payload.iv.length > 0
    && typeof payload.tag === "string" && payload.tag.length > 0
    && typeof payload.ciphertext === "string" && payload.ciphertext.length > 0;
}

export function encryptJson(value: unknown, secret: string): string {
  const key = keyFromSecret(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv(algorithm, key, iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const payload: EncryptedPayload = {
    algorithm,
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
  };
  return JSON.stringify(payload);
}

export function decryptJson<T = unknown>(payloadText: string, secret: string): T {
  const payload = JSON.parse(payloadText) as unknown;
  if (!isEncryptedPayload(payload)) {
    throw new Error("Unsupported encrypted payload algorithm.");
  }
  const decipher = createDecipheriv(algorithm, keyFromSecret(secret), Buffer.from(payload.iv, "base64url"));
  decipher.setAuthTag(Buffer.from(payload.tag, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, "base64url")),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString("utf8")) as T;
}

function keyFromSecret(secret: string) {
  const normalized = secret.trim();
  if (normalized.length < 16) {
    throw new Error("WhatsApp session encryption key must be at least 16 characters.");
  }
  return createHash("sha256").update(normalized).digest();
}
