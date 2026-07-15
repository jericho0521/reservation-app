import { readFileSync } from "node:fs";

export {
  SecretDecryptionError,
  decryptSecretEnvelope,
  encryptSecretEnvelope,
  parseSecretEnvelope,
  type SecretEnvelopeV1,
} from "./secret-envelope.js";

export const platformConfigPathEnvName = "RESERVATION_PLATFORM_CONFIG_PATH";

export interface PlatformRuntimeConfig {
  version: 1;
  app: string;
  modules: {
    reservations: { enabled: boolean };
    ai: {
      enabled: boolean;
      provider?: "openai-compatible";
      baseUrl?: string;
      model?: string;
    };
    whatsapp: {
      enabled: boolean;
      provider: "session_qr";
      automation: {
        enabled: boolean;
        mode: "booking_assistant";
        staffTakeover: {
          enabled: boolean;
          autoMessageOnTakeover: boolean;
        };
      };
    };
    inAppChat: { enabled: boolean };
  };
}

export class PlatformRuntimeConfigError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Invalid platform runtime config: ${issues.join("; ")}`);
    this.name = "PlatformRuntimeConfigError";
    this.issues = issues;
  }
}

const allowedModuleKeys = new Set(["reservations", "ai", "whatsapp", "inAppChat"]);
const secretKeyPattern = /(?:api_?key|secret|token|password|service_?role_?key|private_?key)/iu;

export function loadPlatformRuntimeConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
  options: { readFile?: (path: string) => string } = {},
): PlatformRuntimeConfig | undefined {
  const configPath = env[platformConfigPathEnvName]?.trim();
  if (!configPath) {
    return undefined;
  }

  const readFile = options.readFile ?? ((path: string) => readFileSync(path, "utf8"));
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFile(configPath)) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new PlatformRuntimeConfigError([`${platformConfigPathEnvName} could not be loaded: ${message}`]);
  }

  return parsePlatformRuntimeConfig(parsed);
}

export function parsePlatformRuntimeConfig(input: unknown): PlatformRuntimeConfig {
  const issues: string[] = [];
  rejectSecretKeys(input, "$", issues);

  const root = asRecord(input);
  if (!root) {
    throw new PlatformRuntimeConfigError(["config must be a JSON object"]);
  }

  if (root.version !== 1) {
    issues.push("version must be 1");
  }
  const app = readString(root.app);
  if (!app) {
    issues.push("app must be a non-empty string");
  }

  const modules = asRecord(root.modules);
  if (!modules) {
    issues.push("modules must be an object");
  }

  for (const key of Object.keys(modules ?? {})) {
    if (!allowedModuleKeys.has(key)) {
      issues.push(`unknown module "${key}"`);
    }
  }

  const reservations = readEnabledModule(modules?.reservations);
  const ai = readAiModule(modules?.ai, issues);
  const whatsapp = readWhatsAppModule(modules?.whatsapp, issues);
  const inAppChat = readEnabledModule(modules?.inAppChat);

  if (whatsapp.automation.enabled && !ai.enabled) {
    issues.push("modules.whatsapp.automation.enabled requires modules.ai.enabled=true");
  }
  if (whatsapp.automation.enabled && whatsapp.automation.mode === "booking_assistant" && !reservations.enabled) {
    issues.push("modules.whatsapp.automation.mode=booking_assistant requires modules.reservations.enabled=true");
  }
  if (inAppChat.enabled) {
    if (!ai.enabled) {
      issues.push("modules.inAppChat.enabled requires modules.ai.enabled=true");
    }
    issues.push("modules.inAppChat.enabled is not supported by this backend runtime yet");
  }

  if (issues.length > 0) {
    throw new PlatformRuntimeConfigError(issues);
  }

  return {
    version: 1,
    app: app!,
    modules: {
      reservations,
      ai,
      whatsapp,
      inAppChat,
    },
  };
}

function readEnabledModule(input: unknown) {
  const record = asRecord(input);
  return { enabled: readBoolean(record?.enabled, false) };
}

function readAiModule(input: unknown, issues: string[]) {
  const record = asRecord(input);
  const enabled = readBoolean(record?.enabled, false);
  const provider = readString(record?.provider);
  if (provider && provider !== "openai-compatible") {
    issues.push("modules.ai.provider must be openai-compatible");
  }
  const baseUrl = readString(record?.baseUrl);
  if (baseUrl && !isHttpUrl(baseUrl)) {
    issues.push("modules.ai.baseUrl must be an absolute http or https URL");
  }
  return {
    enabled,
    ...(provider ? { provider: "openai-compatible" as const } : {}),
    ...(baseUrl ? { baseUrl } : {}),
    ...(readString(record?.model) ? { model: readString(record?.model)! } : {}),
  };
}

function readWhatsAppModule(input: unknown, issues: string[]) {
  const record = asRecord(input);
  const provider = readString(record?.provider) ?? "session_qr";
  if (provider === "meta_cloud") {
    issues.push("modules.whatsapp.provider=meta_cloud is reserved but not supported by this runtime");
  } else if (provider !== "session_qr") {
    issues.push("modules.whatsapp.provider must be session_qr");
  }
  const automation = asRecord(record?.automation);
  const staffTakeover = asRecord(automation?.staffTakeover);
  const mode = readString(automation?.mode) ?? "booking_assistant";
  if (mode !== "booking_assistant") {
    issues.push("modules.whatsapp.automation.mode must be booking_assistant");
  }
  return {
    enabled: readBoolean(record?.enabled, false),
    provider: "session_qr" as const,
    automation: {
      enabled: readBoolean(automation?.enabled, false),
      mode: "booking_assistant" as const,
      staffTakeover: {
        enabled: readBoolean(staffTakeover?.enabled, true),
        autoMessageOnTakeover: readBoolean(staffTakeover?.autoMessageOnTakeover, false),
      },
    },
  };
}

function rejectSecretKeys(value: unknown, path: string, issues: string[]) {
  if (!value || typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectSecretKeys(item, `${path}[${index}]`, issues));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (secretKeyPattern.test(key)) {
      issues.push(`${path}.${key} must not contain secrets; use environment variables`);
    }
    rejectSecretKeys(child, `${path}.${key}`, issues);
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
