import { platformErrorBody } from "@reservation-platform/api";
import type { MetadataRecord } from "@reservation-platform/contract-types";
import type {
  WhatsAppBusinessConfigPatch,
  WhatsAppKnowledgeInput,
  WhatsAppKnowledgePatch,
} from "@reservation-platform/whatsapp";
import { jsonResponse, platformError, type StandaloneApiResponse } from "./http.js";
import { isPlainRecord } from "./request-utils.js";

export function getStringField(record: Record<string, unknown>, fieldName: string) {
  const value = record[fieldName];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export function readMetadataField(record: Record<string, unknown>): MetadataRecord | undefined {
  const metadata = record.metadata;
  return isPlainRecord(metadata) ? metadata as MetadataRecord : undefined;
}

export function toMetadataRecord(value: unknown): MetadataRecord | undefined {
  if (!isPlainRecord(value)) return undefined;
  const entries = Object.entries(value).filter(
    (entry): entry is [string, string | number | boolean | null] =>
      entry[1] === null
      || typeof entry[1] === "string"
      || typeof entry[1] === "boolean"
      || (typeof entry[1] === "number" && Number.isFinite(entry[1])),
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

export function readWhatsAppConfigPatch(record: Record<string, unknown>):
  | { ok: true; value: WhatsAppBusinessConfigPatch }
  | { ok: false; response: StandaloneApiResponse } {
  const validation = validateWhatsAppConfigPatch(record);
  if (!validation.ok) return validation;
  const patch: WhatsAppBusinessConfigPatch = {};
  assignOptionalString(record, patch, "business_name");
  assignOptionalStringOrNull(record, patch, "default_service_id");
  assignOptionalString(record, patch, "language");
  assignOptionalString(record, patch, "tone");
  assignOptionalString(record, patch, "fallback_message");
  assignOptionalBoolean(record, patch, "booking_confirmation_required");
  assignOptionalStringOrNull(record, patch, "opening_hours");
  const metadata = readMetadataField(record);
  if (metadata) patch.metadata = metadata;
  return { ok: true, value: patch };
}

function validateWhatsAppConfigPatch(record: Record<string, unknown>):
  | { ok: true }
  | { ok: false; response: StandaloneApiResponse } {
  for (const fieldName of ["business_name", "language", "tone", "fallback_message"] as const) {
    if (fieldName in record && getStringField(record, fieldName) === undefined) {
      return { ok: false, response: platformError(400, "validation_failed", `${fieldName} must be a non-empty string.`) };
    }
  }
  if ("default_service_id" in record && record.default_service_id !== null && getStringField(record, "default_service_id") === undefined) {
    return { ok: false, response: platformError(400, "validation_failed", "default_service_id must be a non-empty string or null.") };
  }
  if ("opening_hours" in record && record.opening_hours !== null && getStringField(record, "opening_hours") === undefined) {
    return { ok: false, response: platformError(400, "validation_failed", "opening_hours must be a non-empty string or null.") };
  }
  if ("booking_confirmation_required" in record && typeof record.booking_confirmation_required !== "boolean") {
    return { ok: false, response: platformError(400, "validation_failed", "booking_confirmation_required must be a boolean.") };
  }
  if ("metadata" in record && record.metadata !== undefined && !isPlainRecord(record.metadata)) {
    return { ok: false, response: platformError(400, "validation_failed", "metadata must be an object.") };
  }
  return { ok: true };
}

export function readWhatsAppKnowledgeInput(record: Record<string, unknown>):
  | { ok: true; value: WhatsAppKnowledgeInput }
  | { ok: false; response: StandaloneApiResponse } {
  const title = getStringField(record, "title");
  const content = getStringField(record, "content");
  if (!title || !content) {
    return {
      ok: false,
      response: jsonResponse(400, platformErrorBody("validation_failed", "Knowledge title and content are required.", 400)),
    };
  }
  return {
    ok: true,
    value: {
      title,
      content,
      tags: readStringArray(record.tags),
      active: typeof record.active === "boolean" ? record.active : undefined,
      metadata: readMetadataField(record),
    },
  };
}

export function readWhatsAppKnowledgePatch(record: Record<string, unknown>): WhatsAppKnowledgePatch {
  const patch: WhatsAppKnowledgePatch = {};
  assignOptionalString(record, patch, "title");
  assignOptionalString(record, patch, "content");
  if (Array.isArray(record.tags)) patch.tags = readStringArray(record.tags);
  assignOptionalBoolean(record, patch, "active");
  const metadata = readMetadataField(record);
  if (metadata) patch.metadata = metadata;
  return patch;
}

function assignOptionalString(source: Record<string, unknown>, target: object, fieldName: string) {
  const value = getStringField(source, fieldName);
  if (value !== undefined) (target as Record<string, unknown>)[fieldName] = value;
}

function assignOptionalStringOrNull(source: Record<string, unknown>, target: object, fieldName: string) {
  if (source[fieldName] === null) {
    (target as Record<string, unknown>)[fieldName] = null;
    return;
  }
  assignOptionalString(source, target, fieldName);
}

function assignOptionalBoolean(source: Record<string, unknown>, target: object, fieldName: string) {
  if (typeof source[fieldName] === "boolean") (target as Record<string, unknown>)[fieldName] = source[fieldName];
}

function readStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : undefined;
}
