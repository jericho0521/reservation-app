export type SafeLogLevel = "info" | "warn" | "error";

export interface SafeStructuredLogEntry {
  timestamp?: string;
  level: SafeLogLevel;
  event: string;
  component?: string;
  release?: string;
  correlationId?: string;
  path?: string;
  status?: number;
  durationMs?: number;
  errorCode?: string;
  jobKind?: string;
  attempts?: number;
  counts?: Record<string, number>;
}

const redactedValue = "[REDACTED]";
const sensitiveKeyPattern = /(?:authorization|cookie|password|token|secret|api[_-]?key|credential|qr|message|content|prompt|session)/iu;

export function safeLogValue(value: unknown): unknown {
  return redact(value, new WeakSet<object>());
}

export function safeStructuredLogEntry(value: SafeStructuredLogEntry): SafeStructuredLogEntry {
  return {
    ...(safeString(value.timestamp) ? { timestamp: safeString(value.timestamp)! } : {}),
    level: value.level,
    event: safeString(value.event) ?? "unknown_event",
    ...(safeString(value.component) ? { component: safeString(value.component)! } : {}),
    ...(safeString(value.release) ? { release: safeString(value.release)! } : {}),
    ...(safeString(value.correlationId) ? { correlationId: safeString(value.correlationId)! } : {}),
    ...(safeString(value.path) ? { path: safeString(value.path)! } : {}),
    ...(finiteNumber(value.status) ? { status: value.status } : {}),
    ...(finiteNumber(value.durationMs) ? { durationMs: value.durationMs } : {}),
    ...(safeCode(value.errorCode) ? { errorCode: value.errorCode } : {}),
    ...(safeCode(value.jobKind) ? { jobKind: value.jobKind } : {}),
    ...(finiteNumber(value.attempts) ? { attempts: value.attempts } : {}),
    ...(value.counts ? { counts: safeCounts(value.counts) } : {}),
  };
}

function redact(value: unknown, seen: WeakSet<object>): unknown {
  if (Array.isArray(value)) return value.map((entry) => redact(entry, seen));
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);
  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    output[key] = sensitiveKeyPattern.test(key) ? redactedValue : redact(entry, seen);
  }
  return output;
}

function safeString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 512) : undefined;
}

function safeCode(value: unknown) {
  return typeof value === "string" && /^[a-z][a-z0-9_.-]{0,127}$/u.test(value) ? value : undefined;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function safeCounts(value: Record<string, number>) {
  return Object.fromEntries(Object.entries(value)
    .filter(([key, count]) => /^[a-z][a-z0-9_]{0,63}$/u.test(key) && Number.isSafeInteger(count) && count >= 0)
    .slice(0, 20));
}
