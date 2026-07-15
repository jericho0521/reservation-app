import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const algorithm = "aes-256-gcm";
const ivLength = 12;
const tagLength = 16;
const base64UrlPattern = /^[A-Za-z0-9_-]+$/u;

export interface SecretEnvelopeV1 {
  v: 1;
  alg: "aes-256-gcm";
  iv: string;
  tag: string;
  ciphertext: string;
}

export class SecretDecryptionError extends Error {
  readonly code = "secret_decryption_failed";

  constructor() {
    super("Integration credential could not be decrypted.");
    this.name = "SecretDecryptionError";
  }
}

export function encryptSecretEnvelope(
  value: unknown,
  installationKey: string | Uint8Array,
): SecretEnvelopeV1 {
  const plaintext = serializeSecret(value);
  const iv = randomBytes(ivLength);
  const cipher = createCipheriv(algorithm, deriveKey(installationKey), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    v: 1,
    alg: algorithm,
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
  };
}

export function decryptSecretEnvelope<T = unknown>(
  envelope: unknown,
  installationKey: string | Uint8Array,
): T {
  try {
    const parsed = parseSecretEnvelope(envelope);
    const decipher = createDecipheriv(algorithm, deriveKey(installationKey), decodeBase64Url(parsed.iv));
    decipher.setAuthTag(decodeBase64Url(parsed.tag));
    const plaintext = Buffer.concat([
      decipher.update(decodeBase64Url(parsed.ciphertext)),
      decipher.final(),
    ]);
    return JSON.parse(plaintext.toString("utf8")) as T;
  } catch {
    throw new SecretDecryptionError();
  }
}

export function parseSecretEnvelope(value: unknown): SecretEnvelopeV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SecretDecryptionError();
  }
  const envelope = value as Record<string, unknown>;
  if (
    Object.keys(envelope).some((key) => !["v", "alg", "iv", "tag", "ciphertext"].includes(key))
    || envelope.v !== 1
    || envelope.alg !== algorithm
    || typeof envelope.iv !== "string"
    || typeof envelope.tag !== "string"
    || typeof envelope.ciphertext !== "string"
  ) {
    throw new SecretDecryptionError();
  }
  const iv = decodeBase64Url(envelope.iv);
  const tag = decodeBase64Url(envelope.tag);
  const ciphertext = decodeBase64Url(envelope.ciphertext);
  if (iv.length !== ivLength || tag.length !== tagLength || ciphertext.length === 0) {
    throw new SecretDecryptionError();
  }
  return {
    v: 1,
    alg: algorithm,
    iv: envelope.iv,
    tag: envelope.tag,
    ciphertext: envelope.ciphertext,
  };
}

function deriveKey(installationKey: string | Uint8Array): Buffer {
  const source = typeof installationKey === "string"
    ? Buffer.from(installationKey, "utf8")
    : Buffer.from(installationKey);
  if (source.length === 0) {
    throw new Error("Installation encryption key must not be empty.");
  }
  return createHash("sha256").update(source).digest();
}

function serializeSecret(value: unknown): Buffer {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new TypeError("Integration credential must be JSON serializable.");
  }
  return Buffer.from(serialized, "utf8");
}

function decodeBase64Url(value: string): Buffer {
  if (!base64UrlPattern.test(value)) throw new SecretDecryptionError();
  const decoded = Buffer.from(value, "base64url");
  if (decoded.toString("base64url") !== value) throw new SecretDecryptionError();
  return decoded;
}
