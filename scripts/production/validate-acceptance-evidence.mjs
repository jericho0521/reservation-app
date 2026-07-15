#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const requiredAcceptanceTasks = Object.freeze([
  "install", "owner_setup", "recovery_key_export", "business_configuration",
  "email_test", "ai_booking", "whatsapp_booking", "web_booking",
  "customer_reschedule", "customer_cancel", "staff_create", "staff_reschedule",
  "staff_complete", "staff_no_show", "takeover_resume", "api_restart",
  "worker_restart", "notification_retry", "verified_backup",
]);

export function validateAcceptanceMarkdown(markdown) {
  const errors = [];
  const match = /```acceptance-evidence\s*\n([\s\S]*?)\n```/u.exec(markdown);
  if (!match) return { ok: false, errors: ["missing acceptance-evidence JSON block"] };
  let value;
  try { value = JSON.parse(match[1]); } catch { return { ok: false, errors: ["acceptance-evidence block is not valid JSON"] }; }
  if (!isRecord(value)) return { ok: false, errors: ["acceptance evidence must be an object"] };

  requiredEqual(value.schema_version, 1, "schema_version", errors);
  requiredEqual(value.evidence_status, "completed", "evidence_status", errors);
  requireMatch(value.release_version, /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u, "release_version", errors);
  requireMatch(value.commit_sha, /^[0-9a-f]{40}$/u, "commit_sha", errors);
  requireMatch(value.migration_version, /^\d{6}$/u, "migration_version", errors);
  const digests = record(value.image_digests, "image_digests", errors);
  for (const component of ["api", "worker", "console", "booking", "tools"]) requireMatch(digests[component], /^sha256:[0-9a-f]{64}$/u, `image_digests.${component}`, errors);

  const operator = record(value.operator, "operator", errors);
  requireText(operator.role, "operator.role", errors);
  requireText(operator.background, "operator.background", errors);
  requiredEqual(operator.independent, true, "operator.independent", errors);
  requireText(operator.signature, "operator.signature", errors);
  requireTimestamp(operator.signed_at, "operator.signed_at", errors);

  const started = requireTimestamp(value.started_at, "started_at", errors);
  const ended = requireTimestamp(value.ended_at, "ended_at", errors);
  if (started !== undefined && ended !== undefined && ended - started < 8 * 60 * 60 * 1000) errors.push("acceptance run must span at least eight hours");

  const tasks = stringArray(value.tasks_completed, "tasks_completed", errors);
  for (const task of requiredAcceptanceTasks) if (!tasks.includes(task)) errors.push(`tasks_completed is missing ${task}`);
  objectArray(value.incidents, "incidents", errors);
  objectArray(value.recovery_actions, "recovery_actions", errors);
  const counts = record(value.counts, "counts", errors);
  for (const key of ["reservations", "messages", "jobs"]) requireNonnegativeInteger(counts[key], `counts.${key}`, errors);
  const backup = record(value.backup, "backup", errors);
  requireMatch(backup.id, /^[0-9a-f-]{16,64}$/u, "backup.id", errors);
  requireMatch(backup.checksum, /^sha256:[0-9a-f]{64}$/u, "backup.checksum", errors);
  requiredEqual(value.verdict, "accepted", "verdict", errors);

  scanSensitive(value, [], errors);
  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}

function scanSensitive(value, path, errors) {
  if (Array.isArray(value)) { value.forEach((item, index) => scanSensitive(item, [...path, String(index)], errors)); return; }
  if (isRecord(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (/(?:authorization|cookie|password|secret|token|credential|api.?key|qr|message.?body|prompt|customer.?email|customer.?phone)/iu.test(key)) errors.push(`prohibited sensitive field: ${[...path, key].join(".")}`);
      scanSensitive(item, [...path, key], errors);
    }
    return;
  }
  if (typeof value !== "string") return;
  const fieldPath = path.join(".");
  if (/bearer\s+[a-z0-9._~+/-]+=*/iu.test(value)) errors.push(`bearer credential detected at ${path.join(".")}`);
  if (/(?:sha|digest|checksum|\.id$|_at$|version)/u.test(fieldPath)) return;
  if (/\b[^\s@]+@[^\s@]+\.[^\s@]+\b/u.test(value)) errors.push(`email address detected at ${path.join(".")}`);
  if (/\+\d[\d\s().-]{6,}\d/u.test(value) || /\b\d{2,4}[\s().-]+\d{3,4}[\s.-]+\d{4}\b/u.test(value)) errors.push(`phone-like value detected at ${path.join(".")}`);
}
function record(value, label, errors) { if (!isRecord(value)) { errors.push(`${label} must be an object`); return {}; } return value; }
function stringArray(value, label, errors) { if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) { errors.push(`${label} must be a string array`); return []; } return value; }
function objectArray(value, label, errors) { if (!Array.isArray(value) || value.some((item) => !isRecord(item))) errors.push(`${label} must be an object array`); }
function requireText(value, label, errors) { if (typeof value !== "string" || value.trim().length < 2 || /^(?:pending|todo|tbd|placeholder)$/iu.test(value.trim())) errors.push(`${label} must be completed`); }
function requireMatch(value, pattern, label, errors) { if (typeof value !== "string" || !pattern.test(value)) errors.push(`${label} is invalid`); }
function requireNonnegativeInteger(value, label, errors) { if (!Number.isSafeInteger(value) || value < 0) errors.push(`${label} must be a non-negative integer`); }
function requiredEqual(value, expected, label, errors) { if (value !== expected) errors.push(`${label} must equal ${JSON.stringify(expected)}`); }
function requireTimestamp(value, label, errors) { const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN; if (Number.isNaN(parsed)) { errors.push(`${label} must be an ISO timestamp`); return undefined; } return parsed; }
function isRecord(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }

async function main() {
  const path = process.argv[2];
  if (!path) { console.error("usage: validate-acceptance-evidence.mjs <full-day-acceptance.md>"); process.exitCode = 2; return; }
  const result = validateAcceptanceMarkdown(await readFile(path, "utf8"));
  if (!result.ok) { console.error(["Acceptance evidence is not release-ready:", ...result.errors.map((error) => `- ${error}`)].join("\n")); process.exitCode = 1; return; }
  console.log("Acceptance evidence is complete, sanitized, and release-ready.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
