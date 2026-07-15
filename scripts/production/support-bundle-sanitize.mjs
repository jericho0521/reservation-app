#!/usr/bin/env node

import { readFileSync } from "node:fs";

const mode = process.argv[2];
const input = readFileSync(0, "utf8");
const releasePattern = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;

switch (mode) {
  case "versions":
    writeJson(sanitizeVersions(parseJson(input)));
    break;
  case "compose":
    writeJson(parseRecords(input).slice(0, 100).map(sanitizeCompose).filter(Boolean));
    break;
  case "health":
    writeJson(sanitizeHealth(parseJson(input)));
    break;
  case "queue":
    writeJson(sanitizeQueue(parseJson(input)));
    break;
  case "disk":
    writeJson(sanitizeDisk(parseJson(input)));
    break;
  case "config":
    writeJson(sanitizeConfigPresence(parseJson(input)));
    break;
  case "logs": {
    const errors = parseRecords(input)
      .map(sanitizeLogError)
      .filter(Boolean)
      .slice(-500);
    process.stdout.write(errors.map((value) => `${JSON.stringify(value)}\n`).join(""));
    break;
  }
  default:
    process.stderr.write("usage: support-bundle-sanitize.mjs versions|compose|health|queue|disk|config|logs\n");
    process.exitCode = 2;
}

function sanitizeVersions(value) {
  const releaseVersion = safeVersion(value?.release_version);
  const migrationVersion = typeof value?.migration_version === "string" && /^\d{6}$/u.test(value.migration_version)
    ? value.migration_version
    : "unknown";
  return { release_version: releaseVersion, migration_version: migrationVersion };
}

function sanitizeCompose(value) {
  if (!isRecord(value)) return undefined;
  const service = safeIdentifier(value.Service ?? value.service);
  const state = safeEnum(value.State ?? value.state, ["created", "dead", "exited", "paused", "removing", "restarting", "running", "unknown"]);
  const health = safeEnum(value.Health ?? value.health, ["healthy", "starting", "unhealthy", "none", "unknown"]);
  const image = safeImage(value.Image ?? value.image);
  if (!service && !state && !health && !image) return undefined;
  return {
    ...(service ? { service } : {}),
    ...(state ? { state } : {}),
    ...(health ? { health } : {}),
    ...(image ? { image } : {}),
  };
}

function sanitizeHealth(value) {
  if (!isRecord(value)) return { status: "unavailable" };
  const status = safeEnum(value.status, ["ok", "ready", "not_ready", "healthy", "degraded", "offline", "unavailable"])
    ?? "unavailable";
  const components = isRecord(value.components)
    ? Object.fromEntries(["process", "database", "migrations"].flatMap((key) =>
      typeof value.components[key] === "boolean" ? [[key, value.components[key]]] : []
    ))
    : {};
  return { status, ...(Object.keys(components).length ? { components } : {}) };
}

function sanitizeQueue(value) {
  if (!isRecord(value)) return { pending: 0, failed: 0, oldest_age_seconds: 0, status: "unavailable" };
  return {
    pending: nonnegativeInteger(value.pending),
    failed: nonnegativeInteger(value.failed),
    oldest_age_seconds: nonnegativeInteger(value.oldest_age_seconds),
  };
}

function sanitizeDisk(value) {
  if (!isRecord(value)) return { status: "unavailable" };
  return {
    capacity_kb: nonnegativeInteger(value.capacity_kb),
    used_kb: nonnegativeInteger(value.used_kb),
    available_kb: nonnegativeInteger(value.available_kb),
    used_percent: Math.min(100, nonnegativeInteger(value.used_percent)),
  };
}

function sanitizeConfigPresence(value) {
  if (!isRecord(value)) return {};
  return Object.fromEntries([
    "ai_configured",
    "email_configured",
    "whatsapp_configured",
  ].flatMap((key) => typeof value[key] === "boolean" ? [[key, value[key]]] : []));
}

function sanitizeLogError(value) {
  if (!isRecord(value)) return undefined;
  const level = safeEnum(value.level, ["warn", "error"]);
  const errorCode = safeIdentifier(value.error_code ?? value.errorCode ?? value.event);
  if (!level || !errorCode) return undefined;
  const timestamp = safeTimestamp(value.timestamp);
  const component = safeIdentifier(value.component);
  const event = safeIdentifier(value.event);
  const jobKind = safeIdentifier(value.job_kind ?? value.jobKind);
  const release = safeVersion(value.release, "") || undefined;
  return {
    ...(timestamp ? { timestamp } : {}),
    level,
    ...(component ? { component } : {}),
    ...(event ? { event } : {}),
    error_code: errorCode,
    ...(jobKind ? { job_kind: jobKind } : {}),
    ...(Number.isInteger(value.attempts) && value.attempts >= 0 && value.attempts <= 1_000 ? { attempts: value.attempts } : {}),
    ...(release ? { release } : {}),
  };
}

function parseRecords(value) {
  const whole = parseJson(value);
  if (Array.isArray(whole)) return whole.filter(isRecord);
  if (isRecord(whole)) return [whole];
  return value.split(/\r?\n/u).flatMap((line) => {
    const objectStart = line.indexOf("{");
    if (objectStart < 0) return [];
    const parsed = parseJson(line.slice(objectStart));
    return isRecord(parsed) ? [parsed] : [];
  });
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function safeVersion(value, fallback = "unknown") {
  return typeof value === "string" && (releasePattern.test(value) || value === "development" || value === "unknown") ? value : fallback;
}

function safeIdentifier(value) {
  return typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/u.test(value) ? value : undefined;
}

function safeImage(value) {
  return typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9./_:@-]{0,255}$/u.test(value) ? value : undefined;
}

function safeTimestamp(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/u.test(value) ? value : undefined;
}

function safeEnum(value, allowed) {
  return typeof value === "string" && allowed.includes(value.toLowerCase()) ? value.toLowerCase() : undefined;
}

function nonnegativeInteger(value) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}
