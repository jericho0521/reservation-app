import type { MetadataRecord, ResourceResponse, ServiceResponse } from "@reservation-platform/contract-types";

export type WhatsAppBookingMode = "capacity" | "assigned_resource";

export interface WhatsAppBookingFieldConfig {
  name: string;
  label: string;
  required: boolean;
}

export interface WhatsAppServiceBookingConfig {
  mode: WhatsAppBookingMode;
  required_fields: WhatsAppBookingFieldConfig[];
  labels: {
    service?: string;
    date?: string;
    start_time?: string;
    end_time?: string;
    quantity?: string;
    resource?: string;
    resource_ids?: string;
    customer_name?: string;
    customer_phone?: string;
    purpose?: string;
  };
  default_quantity?: number;
  min_quantity?: number;
  max_quantity?: number;
}

export interface WhatsAppBookingFields {
  service_id?: string;
  date?: string;
  start_time?: string;
  end_time?: string;
  quantity?: number;
  resource_ids?: string[];
  customer_name?: string;
  customer_phone?: string;
  purpose?: string;
}

const DEFAULT_REQUIRED_FIELDS = ["service_id", "date", "start_time", "quantity", "customer_name", "customer_phone"] as const;

export function readWhatsAppServiceBookingConfig(service: ServiceResponse): WhatsAppServiceBookingConfig {
  const parsed = parseServiceMetadataConfig(service.metadata);
  const mode = parsed?.mode ?? (service.resource_strategy === "assigned_resource" ? "assigned_resource" : "capacity");
  const requiredFields = parsed?.required_fields ?? defaultFields(mode);
  return {
    mode,
    required_fields: requiredFields,
    labels: parsed?.labels ?? {},
    default_quantity: normalizePositiveInteger(parsed?.default_quantity),
    min_quantity: normalizePositiveInteger(parsed?.min_quantity),
    max_quantity: normalizePositiveInteger(parsed?.max_quantity),
  };
}

export function missingBookingFields(
  fields: WhatsAppBookingFields,
  config: WhatsAppServiceBookingConfig,
): WhatsAppBookingFieldConfig[] {
  return config.required_fields.filter((field) => !hasBookingField(fields, field.name));
}

export function mergeBookingFields(
  current: WhatsAppBookingFields | undefined,
  next: WhatsAppBookingFields | undefined,
): WhatsAppBookingFields {
  return {
    ...(current ?? {}),
    ...(next ?? {}),
    resource_ids: next?.resource_ids && next.resource_ids.length > 0
      ? next.resource_ids
      : current?.resource_ids,
  };
}

export function normalizeBookingFields(input: unknown): WhatsAppBookingFields {
  const record = input && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  return {
    service_id: stringValue(record.service_id),
    date: normalizeDate(stringValue(record.date)),
    start_time: normalizeTime(stringValue(record.start_time)),
    end_time: normalizeTime(stringValue(record.end_time)),
    quantity: normalizePositiveInteger(record.quantity),
    resource_ids: Array.isArray(record.resource_ids)
      ? record.resource_ids.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : undefined,
    customer_name: stringValue(record.customer_name),
    customer_phone: stringValue(record.customer_phone),
    purpose: stringValue(record.purpose),
  };
}

export function summarizeBookingDraft(input: {
  service: ServiceResponse;
  fields: WhatsAppBookingFields;
  resources?: ResourceResponse[];
}) {
  const resources = input.fields.resource_ids?.join(", ");
  return [
    `Service: ${input.service.name}`,
    `Date: ${input.fields.date}`,
    `Time: ${input.fields.start_time}${input.fields.end_time ? `-${input.fields.end_time}` : ""}`,
    `Quantity: ${input.fields.quantity ?? 1}`,
    resources ? `Resources: ${resources}` : undefined,
    `Name: ${input.fields.customer_name}`,
    `Phone: ${input.fields.customer_phone}`,
    input.fields.purpose ? `Purpose: ${input.fields.purpose}` : undefined,
  ].filter(Boolean).join("\n");
}

export function isConfirmationMessage(message: string) {
  return /^(yes|y|confirm|confirmed|ok|okay|book it|proceed)$/iu.test(message.trim());
}

function parseServiceMetadataConfig(metadata: MetadataRecord | undefined): WhatsAppServiceBookingConfig | undefined {
  const raw = metadata?.whatsapp_booking_config;
  if (typeof raw !== "string" || !raw.trim()) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return undefined;
    }
    const record = parsed as Record<string, unknown>;
    const mode = record.mode === "assigned_resource" ? "assigned_resource" : "capacity";
    const labels = parseLabels(record.labels ?? record.field_labels);
    return {
      mode,
      required_fields: Array.isArray(record.required_fields)
        ? record.required_fields
          .map((field) => normalizeFieldConfig(field, labels))
          .filter((field): field is WhatsAppBookingFieldConfig => Boolean(field))
        : defaultFields(mode),
      labels,
      default_quantity: normalizePositiveInteger(record.default_quantity),
      min_quantity: normalizePositiveInteger(record.min_quantity),
      max_quantity: normalizePositiveInteger(record.max_quantity),
    };
  } catch {
    return undefined;
  }
}

function defaultFields(mode: WhatsAppBookingMode): WhatsAppBookingFieldConfig[] {
  const fields = [...DEFAULT_REQUIRED_FIELDS];
  if (mode === "assigned_resource") {
    fields.push("resource_ids" as typeof DEFAULT_REQUIRED_FIELDS[number]);
  }
  return fields.map((name) => ({
    name,
    label: defaultLabel(name),
    required: true,
  }));
}

function normalizeFieldConfig(
  input: unknown,
  labels: WhatsAppServiceBookingConfig["labels"],
): WhatsAppBookingFieldConfig | undefined {
  if (typeof input === "string") {
    return { name: input, label: configuredLabel(input, labels), required: true };
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return undefined;
  }
  const record = input as Record<string, unknown>;
  const name = stringValue(record.name);
  if (!name) {
    return undefined;
  }
  return {
    name,
    label: stringValue(record.label) ?? configuredLabel(name, labels),
    required: record.required !== false,
  };
}

function hasBookingField(fields: WhatsAppBookingFields, name: string) {
  const value = fields[name as keyof WhatsAppBookingFields];
  return Array.isArray(value) ? value.length > 0 : value !== undefined && value !== "";
}

function defaultLabel(name: string) {
  return name.replace(/_/gu, " ");
}

function configuredLabel(name: string, labels: WhatsAppServiceBookingConfig["labels"]) {
  return stringValue(labels[name as keyof WhatsAppServiceBookingConfig["labels"]]) ?? defaultLabel(name);
}

function parseLabels(value: unknown): WhatsAppServiceBookingConfig["labels"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const labels = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(labels).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0),
  ) as WhatsAppServiceBookingConfig["labels"];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function normalizePositiveInteger(value: unknown): number | undefined {
  const numberValue = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : undefined;
}

function normalizeDate(value: string | undefined) {
  return value && /^\d{4}-\d{2}-\d{2}$/u.test(value) ? value : value;
}

function normalizeTime(value: string | undefined) {
  return value && /^\d{2}:\d{2}$/u.test(value) ? value : value;
}
