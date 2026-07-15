import {
  emailIntegrationSettingsInputSchema,
  type EmailIntegrationSettingsInput,
  type EmailIntegrationSettingsResponse,
  type EmailIntegrationTestResponse,
  type EmailTlsMode,
} from "@reservation-platform/contract-types";
import {
  PlatformAuthError,
  requireOwner,
  type AuthenticatedPrincipal,
} from "./sessions.js";

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

export type IntegrationCredentialEncryptor = (
  credential: Record<string, unknown>,
) => SecretEnvelopeV1;

export type IntegrationCredentialDecryptor = (
  envelope: SecretEnvelopeV1,
) => Record<string, unknown>;

export interface EmailConnectionTester {
  test(input: {
    settings: { host: string; port: number; tlsMode: EmailTlsMode; from: string };
    credential: { username?: string; password?: string };
  }): Promise<void>;
}

export async function readEmailIntegrationSettings(input: {
  principal: AuthenticatedPrincipal;
  repository: Pick<IntegrationSettingsRepository, "read">;
}): Promise<EmailIntegrationSettingsResponse> {
  const settings = await readIntegrationSettings({ ...input, kind: "email" });
  return emailSettingsResponse(settings);
}

export async function saveEmailIntegrationSettings(input: {
  principal: AuthenticatedPrincipal;
  settings: EmailIntegrationSettingsInput;
  repository: IntegrationSettingsRepository;
  encryptCredential: IntegrationCredentialEncryptor;
}): Promise<EmailIntegrationSettingsResponse> {
  const parsed = emailIntegrationSettingsInputSchema.safeParse(input.settings);
  if (!parsed.success) throw validationError("Email integration settings are invalid.");
  const value = parsed.data;
  const saved = await saveIntegrationSettings({
    principal: input.principal,
    kind: "email",
    settings: {
      enabled: value.enabled,
      provider: "smtp",
      publicConfig: {
        host: value.host,
        port: value.port,
        tls_mode: value.tls_mode,
        from_address: value.from_address,
      },
      ...(value.username && value.password
        ? { credential: { username: value.username, password: value.password } }
        : {}),
    },
    repository: input.repository,
    encryptCredential: input.encryptCredential,
  });
  return emailSettingsResponse(saved);
}

export async function testEmailIntegration(input: {
  principal: AuthenticatedPrincipal;
  repository: Pick<IntegrationSettingsRepository, "read" | "readCredential">;
  decryptCredential: IntegrationCredentialDecryptor;
  tester: EmailConnectionTester;
  timeoutMs?: number;
}): Promise<EmailIntegrationTestResponse> {
  const settings = await readIntegrationSettings({
    principal: input.principal,
    kind: "email",
    repository: input.repository,
  });
  if (!settings) {
    return { ok: false, message: "Save email settings before testing the connection.", error_code: "not_configured" };
  }
  try {
    const publicConfig = parseEmailPublicConfig(settings.publicConfig);
    const envelope = await input.repository.readCredential(input.principal.tenantId, "email");
    const credential = envelope ? parseEmailCredential(input.decryptCredential(envelope)) : {};
    await withDeadline(input.tester.test({ settings: publicConfig, credential }), input.timeoutMs);
    return { ok: true, message: "SMTP connection succeeded." };
  } catch {
    return { ok: false, message: "SMTP connection could not be established.", error_code: "connection_failed" };
  }
}

export async function readIntegrationSettings(input: {
  principal: AuthenticatedPrincipal;
  kind: IntegrationKind;
  repository: Pick<IntegrationSettingsRepository, "read">;
}): Promise<IntegrationSettingsRecord | undefined> {
  requireOwner(input.principal);
  const kind = validateKind(input.kind);
  const settings = await input.repository.read(input.principal.tenantId, kind);
  return settings ? sanitizeSettings(settings, input.principal.tenantId, kind) : undefined;
}

export async function saveIntegrationSettings(input: {
  principal: AuthenticatedPrincipal;
  kind: IntegrationKind;
  settings: {
    enabled: boolean;
    provider: string;
    publicConfig: Record<string, unknown>;
    credential?: Record<string, unknown>;
  };
  repository: IntegrationSettingsRepository;
  encryptCredential: IntegrationCredentialEncryptor;
}): Promise<IntegrationSettingsRecord> {
  requireOwner(input.principal);
  const kind = validateKind(input.kind);
  const provider = validateProvider(kind, input.settings.provider);
  const publicConfig = validatePublicConfig(kind, provider, input.settings.publicConfig);
  const envelope = input.settings.credential === undefined
    ? undefined
    : input.encryptCredential(validateCredential(input.settings.credential));

  const saved = await input.repository.saveSettings({
    tenantId: input.principal.tenantId,
    actorUserId: input.principal.userId,
    kind,
    enabled: input.settings.enabled,
    provider,
    publicConfig,
    ...(envelope ? { envelope } : {}),
  });
  return sanitizeSettings(saved, input.principal.tenantId, kind);
}

export async function rotateIntegrationCredential(input: {
  principal: AuthenticatedPrincipal;
  kind: IntegrationKind;
  credential: Record<string, unknown>;
  repository: Pick<IntegrationSettingsRepository, "rotateCredential">;
  encryptCredential: IntegrationCredentialEncryptor;
}): Promise<void> {
  requireOwner(input.principal);
  const kind = validateKind(input.kind);
  const envelope = input.encryptCredential(validateCredential(input.credential));
  await input.repository.rotateCredential({
    tenantId: input.principal.tenantId,
    actorUserId: input.principal.userId,
    kind,
    envelope,
  });
}

export async function deleteIntegrationCredential(input: {
  principal: AuthenticatedPrincipal;
  kind: IntegrationKind;
  repository: Pick<IntegrationSettingsRepository, "deleteCredential">;
}): Promise<void> {
  requireOwner(input.principal);
  const kind = validateKind(input.kind);
  await input.repository.deleteCredential({
    tenantId: input.principal.tenantId,
    actorUserId: input.principal.userId,
    kind,
  });
}

function sanitizeSettings(
  settings: IntegrationSettingsRecord,
  tenantId: string,
  kind: IntegrationKind,
): IntegrationSettingsRecord {
  if (settings.tenantId !== tenantId || settings.kind !== kind) {
    throw new Error("Integration repository returned settings outside the requested scope.");
  }
  const provider = validateProvider(kind, settings.provider);
  return {
    tenantId,
    kind,
    enabled: settings.enabled,
    provider,
    publicConfig: validatePublicConfig(kind, provider, settings.publicConfig),
    credentialPresent: settings.credentialPresent,
    updatedAt: settings.updatedAt,
  };
}

function emailSettingsResponse(
  settings: IntegrationSettingsRecord | undefined,
): EmailIntegrationSettingsResponse {
  if (!settings) {
    return {
      enabled: false,
      provider: "smtp",
      configured: false,
      credential_present: false,
    };
  }
  const config = parseEmailPublicConfig(settings.publicConfig);
  return {
    enabled: settings.enabled,
    provider: "smtp",
    configured: true,
    host: config.host,
    port: config.port,
    tls_mode: config.tlsMode,
    from_address: config.from,
    credential_present: settings.credentialPresent,
    updated_at: settings.updatedAt,
  };
}

function parseEmailPublicConfig(value: Record<string, unknown>) {
  const input = {
    enabled: true,
    host: value.host,
    port: value.port,
    tls_mode: value.tls_mode,
    from_address: value.from_address,
  };
  const parsed = emailIntegrationSettingsInputSchema.safeParse(input);
  if (!parsed.success) throw validationError("Stored email integration settings are invalid.");
  return {
    host: parsed.data.host,
    port: parsed.data.port,
    tlsMode: parsed.data.tls_mode,
    from: parsed.data.from_address,
  };
}

function parseEmailCredential(value: Record<string, unknown>) {
  if (Object.keys(value).some((key) => key !== "username" && key !== "password")) {
    throw validationError("Stored email integration credential is invalid.");
  }
  const username = typeof value.username === "string" ? value.username.trim() : "";
  const password = typeof value.password === "string" ? value.password : "";
  if (!username || !password || username.length > 320 || password.length > 1_024) {
    throw validationError("Stored email integration credential is invalid.");
  }
  return { username, password };
}

async function withDeadline<T>(promise: Promise<T>, requestedTimeoutMs = 10_000): Promise<T> {
  const timeoutMs = Number.isSafeInteger(requestedTimeoutMs) && requestedTimeoutMs > 0
    ? Math.min(requestedTimeoutMs, 10_000)
    : 10_000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("Email connection test timed out.")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function validateKind(value: IntegrationKind): IntegrationKind {
  if (value !== "email" && value !== "ai" && value !== "whatsapp") {
    throw validationError("Integration kind is invalid.");
  }
  return value;
}

const providers: Readonly<Record<IntegrationKind, ReadonlySet<string>>> = {
  email: new Set(["smtp"]),
  ai: new Set(["openai", "openai-compatible"]),
  whatsapp: new Set(["baileys"]),
};

function validateProvider(kind: IntegrationKind, value: string): string {
  const provider = value.trim().toLowerCase();
  if (!providers[kind].has(provider)) {
    throw validationError(`Integration provider is not supported for ${kind}.`);
  }
  return provider;
}

function validatePublicConfig(
  kind: IntegrationKind,
  provider: string,
  value: unknown,
): Record<string, unknown> {
  const config = validateJsonObject(value, "Public integration configuration is invalid.");
  const allowed = publicConfigKeys(kind, provider);
  for (const key of Object.keys(config)) {
    if (!allowed.has(key)) {
      throw validationError(`Public ${kind} configuration field '${key}' is not supported.`);
    }
  }

  if (kind === "email") validateEmailPublicConfig(config);
  else if (kind === "ai") validateAiPublicConfig(config);
  else validateWhatsappPublicConfig(config);

  if (JSON.stringify(config).length > 4_096) {
    throw validationError("Public integration configuration is too large.");
  }
  return cloneJson(config);
}

function publicConfigKeys(kind: IntegrationKind, provider: string): ReadonlySet<string> {
  if (kind === "email" && provider === "smtp") {
    return new Set(["host", "port", "tls_mode", "from_address", "from_name"]);
  }
  if (kind === "ai") {
    return new Set(["model", "base_url", "max_output_tokens"]);
  }
  return new Set(["display_name", "phone_number"]);
}

function validateEmailPublicConfig(config: Record<string, unknown>) {
  if ("host" in config) {
    const host = requirePublicString(config.host, "SMTP host", 253);
    if (!/^[a-z0-9.-]+$/iu.test(host) || host.includes("..")) {
      throw validationError("SMTP host is invalid.");
    }
  }
  if ("port" in config && (!Number.isInteger(config.port) || Number(config.port) < 1 || Number(config.port) > 65_535)) {
    throw validationError("SMTP port is invalid.");
  }
  if ("tls_mode" in config && config.tls_mode !== "plain" && config.tls_mode !== "starttls" && config.tls_mode !== "required") {
    throw validationError("SMTP TLS mode is invalid.");
  }
  if ("from_address" in config) {
    const address = requirePublicString(config.from_address, "SMTP from address", 254);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(address)) throw validationError("SMTP from address is invalid.");
  }
  if ("from_name" in config) requirePublicString(config.from_name, "SMTP from name", 120);
}

function validateAiPublicConfig(config: Record<string, unknown>) {
  if ("model" in config) {
    const model = requirePublicString(config.model, "AI model", 128);
    if (!/^[a-z0-9][a-z0-9._:/-]*$/iu.test(model)) throw validationError("AI model is invalid.");
  }
  if ("base_url" in config) validatePublicEndpoint(requirePublicString(config.base_url, "AI base URL", 2_048));
  if ("max_output_tokens" in config && (
    !Number.isInteger(config.max_output_tokens)
    || Number(config.max_output_tokens) < 1
    || Number(config.max_output_tokens) > 32_768
  )) throw validationError("AI output token limit is invalid.");
}

function validateWhatsappPublicConfig(config: Record<string, unknown>) {
  if ("display_name" in config) requirePublicString(config.display_name, "WhatsApp display name", 120);
  if ("phone_number" in config) {
    const phone = requirePublicString(config.phone_number, "WhatsApp phone number", 32);
    if (!/^\+[1-9][0-9]{6,14}$/u.test(phone)) throw validationError("WhatsApp phone number is invalid.");
  }
}

function validatePublicEndpoint(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw validationError("AI base URL is invalid.");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw validationError("AI base URL must not contain credentials, query parameters, or fragments.");
  }
  const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
  if (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) {
    throw validationError("AI base URL must use HTTPS except for a loopback endpoint.");
  }
}

function requirePublicString(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0 || value.length > maxLength) {
    throw validationError(`${label} is invalid.`);
  }
  if (/^(?:bearer\s+|sk-[a-z0-9_-]{8,})/iu.test(value)) {
    throw validationError(`${label} must not contain credential material.`);
  }
  return value;
}

function validateCredential(value: unknown): Record<string, unknown> {
  const credential = validateJsonObject(value, "Integration credential is invalid.");
  if (Object.keys(credential).length === 0) {
    throw validationError("Integration credential is invalid.");
  }
  if (JSON.stringify(credential).length > 32_768) {
    throw validationError("Integration credential is too large.");
  }
  return cloneJson(credential);
}

function validateJsonObject(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw validationError(message);
  try {
    visitJson(value as Record<string, unknown>, new Set());
  } catch (error) {
    if (error instanceof PlatformAuthError) throw error;
    throw validationError(message);
  }
  return value as Record<string, unknown>;
}

function visitJson(value: unknown, seen: Set<object>): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Non-finite JSON number.");
    return;
  }
  if (!value || typeof value !== "object") throw new TypeError("Non-JSON value.");
  if (seen.has(value)) throw new TypeError("Circular JSON value.");
  seen.add(value);
  if (Array.isArray(value)) value.forEach((item) => visitJson(item, seen));
  else Object.values(value).forEach((item) => visitJson(item, seen));
  seen.delete(value);
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function validationError(message: string) {
  return new PlatformAuthError("validation_failed", 400, message);
}
