import {
  cancelReservationInputSchema,
  createReservationInputSchema,
  type AppointmentStatus,
  type ListReservationsResponse,
  type ReservationListSummary,
  type ReservationResponse,
  rescheduleReservationInputSchema,
  type CancelReservationInput,
  type CreateReservationInput,
  type RescheduleReservationInput,
  type UpdateReservationPatch,
} from "@reservation-platform/contract-types";
import { z } from "zod";
import { platformErrorBody } from "./errors.js";
import {
  hasMovementPatchFields,
  toPlatformReservation,
  toLegacyBookingCreateInput,
  toLegacyBookingRescheduleInput,
  toLegacyBookingUpdatePatch,
  toPlatformReservationsResponse,
} from "./platform-adapters.js";

const MAX_SEARCH_LENGTH = 100;
const SEARCH_ONLY_LIMIT = 100;
const supportedPatchFields = new Set(["customer", "status"]);
const supportedCustomerPatchFields = new Set(["name", "email"]);
const reservationIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const legacyReservationItemSchema = z.object({
  resource_id: z.string().uuid().optional().nullable(),
  resource_label: z.string().min(1).optional().nullable(),
  quantity: z.number().int().positive(),
});

const legacyBookingCreateSchema = z.object({
  service_id: z.string().uuid(),
  user_name: z.string().min(1),
  user_email: z.string().email(),
  user_phone: z.string().min(1),
  booking_date: z.string(),
  start_time: z.string(),
  end_time: z.string(),
  seats_booked: z.number().positive(),
  seat_labels: z.array(z.string()).optional(),
  items: z.array(legacyReservationItemSchema).optional(),
  reservation_items: z.array(legacyReservationItemSchema).optional(),
  interface_type: z.enum(["form", "chat"]),
  channel: z.enum(["web_booking", "web_chat", "whatsapp", "staff", "simulation"]).optional(),
  staff_id: z.string().uuid().optional(),
});

export type LegacyBookingCreateInput = z.infer<typeof legacyBookingCreateSchema>;

export interface LegacyReservationItem {
  resource_id?: string;
  resource_label?: string;
  quantity: number;
}

export interface LegacyCoreReservation {
  id?: string;
  service_id: string;
  customer_name: string;
  customer_email: string;
  customer_phone?: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  quantity: number;
  items: LegacyReservationItem[];
  status?: string;
  interface_type: "form" | "chat";
  channel?: "web_booking" | "web_chat" | "whatsapp" | "staff" | "simulation";
  staff_id?: string;
  seats_booked: number;
  seat_labels: string[];
}

export type ReservationCreateAtomicErrorCode =
  | "invalid_service"
  | "invalid_staff"
  | "invalid_reservation"
  | "invalid_resource_labels"
  | "missing_resource_labels"
  | "maintenance_conflict"
  | "resource_conflict"
  | "not_enough_capacity";

export type ReservationCreateAtomicValidation = {
  ok?: boolean;
  error?: string;
  available_quantity?: number;
  conflicting_resource_labels?: string[];
};

export type ReservationCreateAtomicResult = {
  ok: true;
  atomic: true;
  booking: unknown;
  reservation: LegacyCoreReservation;
  validation: { ok: true };
} | {
  ok: false;
  atomic: true;
  reservation: LegacyCoreReservation;
  error: ReservationCreateAtomicErrorCode;
  message?: string;
  validation: ReservationCreateAtomicValidation;
};

export type ReservationReadRepositoryResult<T> = {
  data: T | null;
  error?: unknown | null;
};

export interface ReservationListSummaryInput {
  search: string | null;
  searchFilterExpression: string | null;
  today: string;
}

export type ReservationListSummaryResult = {
  summary: ReservationListSummary | null;
  error?: unknown | null;
};

export interface ReservationReadRepositoryPort {
  listReservations(input: {
    search: string | null;
    searchFilterExpression: string | null;
    limit: number | null;
    venueId?: string;
    date?: string;
    status?: string;
    staffId?: string;
    serviceId?: string;
  }): Promise<ReservationReadRepositoryResult<unknown[]>>;
  getReservationsSummary?(input: ReservationListSummaryInput & { venueId?: string }): Promise<ReservationListSummaryResult>;
  readReservationById(reservationId: string, venueId?: string): Promise<ReservationReadRepositoryResult<unknown>>;
}

export type ReservationMutationRepositoryResult<T> = {
  data: T | null;
  error?: unknown | null;
};

export type LegacyReservationUpdatePatch = ReturnType<typeof toLegacyBookingUpdatePatch> & {
  service_id?: string;
  booking_date?: string;
  start_time?: string;
  end_time?: string;
  seats_booked?: number;
  seat_labels?: string[];
  interface_type?: "form" | "chat";
  cancellation_reason?: string;
  cancelled_by?: string;
  cancelled_at?: string;
};

export interface ReservationMutationRepositoryPort {
  updateReservation(input: {
    reservationId: string;
    patch: LegacyReservationUpdatePatch & { updated_at: string };
    venueId?: string;
  }): Promise<ReservationMutationRepositoryResult<unknown>>;
  transitionAppointment?(input: {
    tenantId: string; venueId: string; actorUserId: string; reservationId: string;
    expectedStatus: AppointmentStatus; targetStatus: AppointmentStatus; reason?: string;
  }): Promise<ReservationMutationRepositoryResult<unknown>>;
  staffRescheduleAppointment?(input: {
    tenantId: string; venueId: string; actorUserId: string; reservationId: string;
    expectedStatus: AppointmentStatus; date: string; startTime: string; staffId: string; reason: string;
  }): Promise<ReservationMutationRepositoryResult<unknown>>;
  staffCreateAppointment?(input: {
    tenantId: string; venueId: string; actorUserId: string; reservation: LegacyCoreReservation;
  }): Promise<ReservationMutationRepositoryResult<unknown>>;
}

export async function staffCreateAppointment(input: {
  repository: ReservationMutationRepositoryPort;
  tenantId: string; venueId: string; actorUserId: string; legacyInput: LegacyBookingCreateInput;
}): Promise<ReservationApplicationResult<ReservationResponse>> {
  if (!input.repository.staffCreateAppointment) return appointmentOperationUnavailable();
  return normalizeAppointmentOperation(await input.repository.staffCreateAppointment({
    tenantId: input.tenantId,
    venueId: input.venueId,
    actorUserId: input.actorUserId,
    reservation: legacyBookingCreateToReservation(input.legacyInput),
  }));
}

export async function transitionAppointment(input: {
  repository: ReservationMutationRepositoryPort;
  tenantId: string; venueId: string; actorUserId: string; reservationId: string;
  expectedStatus: AppointmentStatus; targetStatus: AppointmentStatus; reason?: string;
}): Promise<ReservationApplicationResult<ReservationResponse>> {
  if (!input.repository.transitionAppointment) return appointmentOperationUnavailable();
  return normalizeAppointmentOperation(await input.repository.transitionAppointment(input));
}

export async function staffRescheduleAppointment(input: {
  repository: ReservationMutationRepositoryPort;
  tenantId: string; venueId: string; actorUserId: string; reservationId: string;
  expectedStatus: AppointmentStatus; date: string; startTime: string; staffId: string; reason: string;
}): Promise<ReservationApplicationResult<ReservationResponse>> {
  if (!input.repository.staffRescheduleAppointment) return appointmentOperationUnavailable();
  return normalizeAppointmentOperation(await input.repository.staffRescheduleAppointment(input));
}

function normalizeAppointmentOperation(result: ReservationMutationRepositoryResult<unknown>): ReservationApplicationResult<ReservationResponse> {
  if (result.error) return { status: 500, body: platformErrorBody("internal_error", "Failed to operate appointment", 500) };
  const record = result.data && typeof result.data === "object" && !Array.isArray(result.data)
    ? result.data as Record<string, unknown> : {};
  if (record.ok === true && record.booking) return { status: 200, body: toPlatformReservation(record.booking) };
  const code = record.error_code;
  if (code === "not_found") return { status: 404, body: platformErrorBody("not_found", "Appointment not found", 404) };
  if (code === "forbidden") return { status: 403, body: platformErrorBody("forbidden", "Appointment access is not allowed", 403) };
  const conflictMessages: Record<string, string> = {
    stale: "The appointment changed since it was loaded.",
    invalid_transition: "The requested appointment status transition is not allowed.",
    reason_required: "An audit reason is required for this appointment operation.",
    outside_availability: "The requested time is outside the configured booking availability.",
    invalid_staff: "The selected practitioner is not available for this service and location.",
    unavailable: "The selected practitioner is unavailable due to maintenance.",
    conflict: "The selected practitioner already has a conflicting appointment.",
    invalid_service: "The selected service is not available at this location.",
    invalid_reservation: "The appointment details are invalid.",
    maintenance_conflict: "The selected practitioner is unavailable due to maintenance.",
    resource_conflict: "The selected practitioner already has a conflicting appointment.",
    not_enough_capacity: "The requested appointment capacity is unavailable.",
  };
  if (typeof code === "string" && conflictMessages[code]) {
    return { status: 409, body: platformErrorBody("conflict", conflictMessages[code], 409, { operation_code: code }) };
  }
  return appointmentOperationUnavailable();
}

function appointmentOperationUnavailable(): ReservationApplicationResult<ReservationResponse> {
  return { status: 503, body: platformErrorBody("internal_error", "Appointment operations are not configured", 503) };
}

export interface ReservationCreateRepositoryPort {
  createReservationAtomic(input: {
    reservation: LegacyCoreReservation;
    venueId?: string;
  }): Promise<ReservationCreateAtomicResult>;
}

export type ReservationApplicationResult<T> = {
  status: number;
  body: T | ReturnType<typeof platformErrorBody>;
};

export type ReservationCreatePreparationResult = {
  input: CreateReservationInput;
  status: 200;
} | {
  error: ReturnType<typeof platformErrorBody>;
  status: 400;
};

export type LegacyReservationCreatePreparationResult = {
  legacyInput: ReturnType<typeof toLegacyBookingCreateInput>;
  status: 200;
};

export type ReservationReschedulePreparationResult = {
  input: RescheduleReservationInput;
  status: 200;
} | {
  error: ReturnType<typeof platformErrorBody>;
  status: 400;
};

export type ReservationCancelPreparationResult = {
  input: CancelReservationInput;
  status: 200;
} | {
  error: ReturnType<typeof platformErrorBody>;
  status: 400;
};

export type LegacyReservationReschedulePreparationResult = {
  legacyInput: ReturnType<typeof toLegacyBookingRescheduleInput>;
  status: 200;
};

export type ReservationPatchPreparationResult = {
  error: ReturnType<typeof platformErrorBody>;
  status: 400;
} | {
  legacyPatch: ReturnType<typeof toLegacyBookingUpdatePatch>;
  status: 200;
};

function quoteLegacyFilterValue(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function escapeLegacySearchTerm(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

export function normalizeReservationSearchTerm(search: string | null | undefined) {
  const normalized = search?.trim().slice(0, MAX_SEARCH_LENGTH) ?? "";
  return normalized.length > 0 ? normalized : null;
}

export function buildReservationSearchFilterExpression(search: string) {
  const term = quoteLegacyFilterValue(`%${escapeLegacySearchTerm(search)}%`);
  return `user_name.ilike.${term},user_email.ilike.${term},user_phone.ilike.${term}`;
}

function reservationNotFoundError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as { code?: string; message?: string };
  return (
    maybeError.code === "PGRST116" ||
    maybeError.message?.includes("JSON object requested, multiple (or no) rows returned") === true
  );
}

function repositoryErrorStatus(error: unknown) {
  return reservationNotFoundError(error) ? 404 : 500;
}

function invalidReservationIdIssues(id: string) {
  return [{
    code: "invalid_string",
    validation: "uuid",
    message: "Invalid uuid",
    path: [],
    received: id,
  }];
}

function validationIssue(input: {
  code: string;
  message: string;
  path?: Array<string | number>;
  validation?: string;
  received?: unknown;
}) {
  return {
    code: input.code,
    ...(input.validation === undefined ? {} : { validation: input.validation }),
    message: input.message,
    path: input.path ?? [],
    ...(input.received === undefined ? {} : { received: input.received }),
  };
}

function invalidUuidIssues(id: string) {
  return [validationIssue({
    code: "invalid_string",
    validation: "uuid",
    message: "Invalid uuid",
    received: id,
  })];
}

function resourceLabelDetails(labels: string[] | undefined) {
  const resourceLabels = labels ?? [];
  return {
    resource_labels: resourceLabels,
    seat_labels: resourceLabels,
  };
}

function availableQuantityDetails(availableQuantity: number | undefined) {
  const quantity = availableQuantity ?? 0;
  return {
    available_quantity: quantity,
    available_seats: quantity,
  };
}

function validateReservationId(reservationId: string, message: string) {
  if (reservationIdPattern.test(reservationId)) {
    return null;
  }

  return platformErrorBody("validation_failed", message, 400, invalidUuidIssues(reservationId));
}

function legacyUpdateValidationIssues(patch: unknown) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return [validationIssue({
      code: "invalid_type",
      message: "Expected object",
    })];
  }

  const record = patch as Record<string, unknown>;
  const supportedFields = new Set([
    "service_id",
    "user_name",
    "user_email",
    "booking_date",
    "start_time",
    "end_time",
    "seats_booked",
    "seat_labels",
    "interface_type",
    "status",
  ]);
  const issues: ReturnType<typeof validationIssue>[] = [];

  for (const field of Object.keys(record)) {
    if (!supportedFields.has(field)) {
      issues.push(validationIssue({
        code: "unrecognized_keys",
        message: `Unrecognized key(s) in object: '${field}'`,
        path: [],
      }));
    }
  }

  if ("service_id" in record && (typeof record.service_id !== "string" || !reservationIdPattern.test(record.service_id))) {
    issues.push(validationIssue({
      code: "invalid_string",
      validation: "uuid",
      message: "Invalid uuid",
      path: ["service_id"],
      received: record.service_id,
    }));
  }

  for (const field of ["user_name", "booking_date", "start_time", "end_time"]) {
    const value = record[field];
    if (field in record && (typeof value !== "string" || value.length < 1)) {
      issues.push(validationIssue({
        code: typeof value === "string" ? "too_small" : "invalid_type",
        message: typeof value === "string" ? "String must contain at least 1 character(s)" : "Expected string",
        path: [field],
      }));
    }
  }

  if ("user_email" in record && (typeof record.user_email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.user_email))) {
    issues.push(validationIssue({
      code: "invalid_string",
      validation: "email",
      message: "Invalid email",
      path: ["user_email"],
    }));
  }

  if ("seats_booked" in record && (typeof record.seats_booked !== "number" || !Number.isFinite(record.seats_booked) || record.seats_booked <= 0)) {
    issues.push(validationIssue({
      code: typeof record.seats_booked === "number" ? "too_small" : "invalid_type",
      message: typeof record.seats_booked === "number" ? "Number must be greater than 0" : "Expected number",
      path: ["seats_booked"],
    }));
  }

  if ("seat_labels" in record) {
    if (!Array.isArray(record.seat_labels)) {
      issues.push(validationIssue({
        code: "invalid_type",
        message: "Expected array",
        path: ["seat_labels"],
      }));
    } else {
      record.seat_labels.forEach((label, index) => {
        if (typeof label !== "string") {
          issues.push(validationIssue({
            code: "invalid_type",
            message: "Expected string",
            path: ["seat_labels", index],
          }));
        }
      });
    }
  }

  if ("interface_type" in record && record.interface_type !== "form" && record.interface_type !== "chat") {
    issues.push(validationIssue({
      code: "invalid_enum_value",
      message: "Invalid enum value. Expected 'form' | 'chat'",
      path: ["interface_type"],
    }));
  }

  if ("status" in record && record.status !== "confirmed" && record.status !== "completed" && record.status !== "cancelled") {
    issues.push(validationIssue({
      code: "invalid_enum_value",
      message: "Invalid enum value. Expected 'confirmed' | 'completed' | 'cancelled'",
      path: ["status"],
    }));
  }

  if (issues.length === 0 && Object.keys(record).length === 0) {
    issues.push(validationIssue({
      code: "custom",
      message: "At least one reservation field is required",
    }));
  }

  return issues;
}

type LegacyReservationUpdatePatchValidationResult = {
  data: LegacyReservationUpdatePatch;
} | {
  error: ReturnType<typeof platformErrorBody>;
};

function validateLegacyReservationUpdatePatch(patch: unknown): LegacyReservationUpdatePatchValidationResult {
  const issues = legacyUpdateValidationIssues(patch);
  if (issues.length > 0) {
    return {
      error: platformErrorBody(
        "validation_failed",
        "Invalid reservation update data",
        400,
        issues,
      ),
    };
  }

  return { data: patch as LegacyReservationUpdatePatch };
}

function legacyBookingCreateToReservationItems(
  booking: LegacyBookingCreateInput,
): LegacyReservationItem[] | null {
  const rawItems = booking.items ?? booking.reservation_items;

  if (!rawItems) {
    return null;
  }

  return rawItems.map((item) => ({
    ...(item.resource_id ? { resource_id: item.resource_id } : {}),
    ...(item.resource_label ? { resource_label: item.resource_label } : {}),
    quantity: item.quantity,
  }));
}

function getLegacyItemResourceLabels(items: LegacyReservationItem[]) {
  return Array.from(new Set(
    items
      .map((item) => item.resource_label)
      .filter((label): label is string => typeof label === "string" && label.trim().length > 0),
  ));
}

export function legacyBookingCreateToReservation(
  booking: LegacyBookingCreateInput,
): LegacyCoreReservation {
  const nativeItems = legacyBookingCreateToReservationItems(booking);

  if (!nativeItems) {
    const seatLabels = booking.seat_labels ?? [];
    return {
      service_id: booking.service_id,
      customer_name: booking.user_name,
      customer_email: booking.user_email,
      customer_phone: booking.user_phone,
      booking_date: booking.booking_date,
      start_time: booking.start_time,
      end_time: booking.end_time,
      quantity: booking.seats_booked,
      items: seatLabels.length > 0
        ? seatLabels.map((label) => ({
            resource_label: label,
            quantity: 1,
          }))
        : [{ quantity: booking.seats_booked }],
      status: "confirmed",
      interface_type: booking.interface_type,
      ...(booking.channel ? { channel: booking.channel } : {}),
      ...(booking.staff_id ? { staff_id: booking.staff_id } : {}),
      seats_booked: booking.seats_booked,
      seat_labels: seatLabels,
    };
  }

  const seatLabels = booking.seat_labels ?? getLegacyItemResourceLabels(nativeItems);

  return {
    service_id: booking.service_id,
    customer_name: booking.user_name,
    customer_email: booking.user_email,
    customer_phone: booking.user_phone,
    booking_date: booking.booking_date,
    start_time: booking.start_time,
    end_time: booking.end_time,
    quantity: booking.seats_booked,
    items: nativeItems,
    status: "confirmed",
    interface_type: booking.interface_type,
    ...(booking.channel ? { channel: booking.channel } : {}),
    ...(booking.staff_id ? { staff_id: booking.staff_id } : {}),
    seats_booked: booking.seats_booked,
    seat_labels: seatLabels,
  };
}

function platformAtomicCreateErrorBody(
  error: ReservationCreateAtomicErrorCode,
  validation: ReservationCreateAtomicValidation,
) {
  if (error === "invalid_service") {
    return {
      status: 404,
      body: platformErrorBody("not_found", "Service not found", 404),
    };
  }

  if (error === "invalid_staff") {
    return {
      status: 400,
      body: platformErrorBody("validation_failed", "Selected practitioner is not available for this service", 400),
    };
  }

  if (error === "invalid_reservation") {
    return {
      status: 400,
      body: platformErrorBody("validation_failed", "Invalid reservation data", 400),
    };
  }

  if (error === "invalid_resource_labels") {
    return {
      status: 400,
      body: platformErrorBody(
        "validation_failed",
        "Selected resource labels are not valid for this service",
        400,
        resourceLabelDetails(validation.conflicting_resource_labels),
      ),
    };
  }

  if (error === "missing_resource_labels") {
    return {
      status: 400,
      body: platformErrorBody(
        "validation_failed",
        "Selected resource labels must match requested quantity",
        400,
        resourceLabelDetails(validation.conflicting_resource_labels),
      ),
    };
  }

  if (error === "not_enough_capacity") {
    return {
      status: 409,
      body: platformErrorBody(
        "conflict",
        "Not enough resources available",
        409,
        availableQuantityDetails(validation.available_quantity),
      ),
    };
  }

  if (error === "maintenance_conflict") {
    return {
      status: 409,
      body: platformErrorBody(
        "conflict",
        "Some selected resources are under maintenance",
        409,
        resourceLabelDetails(validation.conflicting_resource_labels),
      ),
    };
  }

  if (error === "resource_conflict") {
    return {
      status: 409,
      body: platformErrorBody(
        "conflict",
        "Some selected resources are no longer available",
        409,
        resourceLabelDetails(validation.conflicting_resource_labels),
      ),
    };
  }

  return {
    status: 500,
    body: platformErrorBody("internal_error", "Failed to create reservation", 500),
  };
}

type LegacyBookingCreateValidationResult = {
  data: LegacyBookingCreateInput;
} | {
  error: ReturnType<typeof platformErrorBody>;
};

function validateLegacyBookingCreateInput(input: unknown): LegacyBookingCreateValidationResult {
  const parsed = legacyBookingCreateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: platformErrorBody(
        "validation_failed",
        "Invalid reservation data",
        400,
        parsed.error.issues,
      ),
    };
  }

  return { data: parsed.data };
}

export async function createReservation(input: {
  repository: ReservationCreateRepositoryPort | (() => ReservationCreateRepositoryPort);
  legacyInput: unknown;
  venueId?: string;
}): Promise<ReservationApplicationResult<ReservationResponse>> {
  const validated = validateLegacyBookingCreateInput(input.legacyInput);
  if ("error" in validated) {
    return {
      status: 400,
      body: validated.error,
    };
  }

  try {
    const repository = typeof input.repository === "function"
      ? input.repository()
      : input.repository;
    const result = await repository.createReservationAtomic({
      reservation: legacyBookingCreateToReservation(validated.data),
      ...(input.venueId ? { venueId: input.venueId } : {}),
    });

    if (!result.ok) {
      return platformAtomicCreateErrorBody(result.error, result.validation);
    }

    return {
      status: 201,
      body: toPlatformReservation(result.booking),
    };
  } catch {
    return {
      status: 500,
      body: platformErrorBody("internal_error", "Failed to create reservation", 500),
    };
  }
}

export async function listReservations(input: {
  repository: Pick<ReservationReadRepositoryPort, "listReservations" | "getReservationsSummary">;
  search?: string | null;
  today?: string;
  venueId?: string;
  date?: string;
  status?: string;
  staffId?: string;
  serviceId?: string;
}): Promise<ReservationApplicationResult<ListReservationsResponse>> {
  try {
    const search = normalizeReservationSearchTerm(input.search);
    const searchFilterExpression = search ? buildReservationSearchFilterExpression(search) : null;
    const { data, error } = await input.repository.listReservations({
      search,
      searchFilterExpression,
      limit: search ? SEARCH_ONLY_LIMIT : null,
      ...(input.venueId ? { venueId: input.venueId } : {}),
      ...(input.date ? { date: input.date } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.staffId ? { staffId: input.staffId } : {}),
      ...(input.serviceId ? { serviceId: input.serviceId } : {}),
    });

    if (error) {
      return {
        status: 500,
        body: platformErrorBody("internal_error", "Failed to fetch reservations", 500),
      };
    }

    const summaryResult = input.repository.getReservationsSummary
      ? await input.repository.getReservationsSummary({
          search,
          searchFilterExpression,
          today: input.today ?? new Date().toISOString().slice(0, 10),
          ...(input.venueId ? { venueId: input.venueId } : {}),
        })
      : null;

    if (summaryResult?.error) {
      return {
        status: 500,
        body: platformErrorBody("internal_error", "Failed to fetch reservation summary", 500),
      };
    }

    return {
      status: 200,
      body: toPlatformReservationsResponse(data ?? [], summaryResult?.summary ?? undefined),
    };
  } catch {
    return {
      status: 500,
      body: platformErrorBody("internal_error", "Failed to fetch reservations", 500),
    };
  }
}

export async function readReservationById(input: {
  repository: Pick<ReservationReadRepositoryPort, "readReservationById">;
  reservationId: string;
  venueId?: string;
}): Promise<ReservationApplicationResult<ReservationResponse>> {
  const reservationId = input.reservationId;
  if (!reservationIdPattern.test(reservationId)) {
    return {
      status: 400,
      body: platformErrorBody(
        "validation_failed",
        "Invalid reservation id",
        400,
        invalidReservationIdIssues(reservationId),
      ),
    };
  }

  try {
    const { data, error } = await input.repository.readReservationById(reservationId, input.venueId);

    if (error) {
      const status = reservationNotFoundError(error) ? 404 : 500;
      return {
        status,
        body: platformErrorBody(
          status === 404 ? "not_found" : "internal_error",
          status === 404 ? "Reservation not found" : "Failed to fetch reservation",
          status,
        ),
      };
    }

    return {
      status: 200,
      body: toPlatformReservation(data),
    };
  } catch {
    return {
      status: 500,
      body: platformErrorBody("internal_error", "Failed to fetch reservation", 500),
    };
  }
}

export async function updateReservationWithLegacyPatch(input: {
  repository: Pick<ReservationMutationRepositoryPort, "updateReservation">;
  reservationId: string;
  legacyPatch: unknown;
  now?: () => Date;
  venueId?: string;
}): Promise<ReservationApplicationResult<ReservationResponse>> {
  const invalidId = validateReservationId(input.reservationId, "Invalid reservation update data");
  if (invalidId) {
    return {
      status: 400,
      body: invalidId,
    };
  }

  const validatedPatch = validateLegacyReservationUpdatePatch(input.legacyPatch);
  if ("error" in validatedPatch) {
    return {
      status: 400,
      body: validatedPatch.error,
    };
  }

  try {
    const { data, error } = await input.repository.updateReservation({
      reservationId: input.reservationId,
      patch: {
        ...validatedPatch.data,
        updated_at: (input.now ?? (() => new Date()))().toISOString(),
      },
      ...(input.venueId ? { venueId: input.venueId } : {}),
    });

    if (error) {
      const status = repositoryErrorStatus(error);
      return {
        status,
        body: platformErrorBody(
          status === 404 ? "not_found" : "internal_error",
          status === 404 ? "Reservation not found" : "Failed to update reservation",
          status,
        ),
      };
    }

    return {
      status: 200,
      body: toPlatformReservation(data),
    };
  } catch {
    return {
      status: 500,
      body: platformErrorBody("internal_error", "Failed to update reservation", 500),
    };
  }
}

export async function cancelReservation(input: {
  repository: Pick<ReservationMutationRepositoryPort, "updateReservation">;
  reservationId: string;
  now?: () => Date;
  audit?: { reason?: string; changedBy?: string };
  venueId?: string;
}): Promise<ReservationApplicationResult<ReservationResponse>> {
  const invalidId = validateReservationId(input.reservationId, "Invalid reservation id");
  if (invalidId) {
    return {
      status: 400,
      body: invalidId,
    };
  }

  try {
    const cancelledAt = (input.now ?? (() => new Date()))().toISOString();
    const { data, error } = await input.repository.updateReservation({
      reservationId: input.reservationId,
      patch: {
        status: "cancelled",
        updated_at: cancelledAt,
        cancelled_at: cancelledAt,
        ...(input.audit?.reason ? { cancellation_reason: input.audit.reason } : {}),
        ...(input.audit?.changedBy ? { cancelled_by: input.audit.changedBy } : {}),
      },
      ...(input.venueId ? { venueId: input.venueId } : {}),
    });

    if (error) {
      const status = repositoryErrorStatus(error);
      return {
        status,
        body: platformErrorBody(
          status === 404 ? "not_found" : "internal_error",
          status === 404 ? "Reservation not found" : "Failed to cancel reservation",
          status,
        ),
      };
    }

    return {
      status: 200,
      body: toPlatformReservation(data),
    };
  } catch {
    return {
      status: 500,
      body: platformErrorBody("internal_error", "Failed to cancel reservation", 500),
    };
  }
}

export function rescheduleReservationWithLegacyPatch(input: {
  repository: Pick<ReservationMutationRepositoryPort, "updateReservation">;
  reservationId: string;
  legacyPatch: unknown;
  now?: () => Date;
}) {
  return updateReservationWithLegacyPatch(input);
}

export function prepareReservationCreateInput(payload: unknown): ReservationCreatePreparationResult {
  const parsed = createReservationInputSchema.safeParse(payload);

  if (!parsed.success) {
    return {
      status: 400,
      error: platformErrorBody(
        "validation_failed",
        "Invalid reservation data.",
        400,
        { issues: toJsonSafeValidationIssues(parsed.error.issues) },
      ),
    };
  }

  return {
    status: 200,
    input: parsed.data,
  };
}

export function prepareLegacyReservationCreate(
  input: CreateReservationInput,
): LegacyReservationCreatePreparationResult {
  return {
    status: 200,
    legacyInput: toLegacyBookingCreateInput(input),
  };
}

export function prepareReservationRescheduleInput(payload: unknown): ReservationReschedulePreparationResult {
  const parsed = rescheduleReservationInputSchema.safeParse(payload);

  if (!parsed.success) {
    return {
      status: 400,
      error: platformErrorBody(
        "validation_failed",
        "Invalid reservation reschedule data.",
        400,
        { issues: toJsonSafeValidationIssues(parsed.error.issues) },
      ),
    };
  }

  return {
    status: 200,
    input: parsed.data,
  };
}

export function prepareLegacyReservationReschedule(
  input: RescheduleReservationInput,
): LegacyReservationReschedulePreparationResult {
  return {
    status: 200,
    legacyInput: toLegacyBookingRescheduleInput(input),
  };
}

export function prepareReservationCancelInput(payload: unknown): ReservationCancelPreparationResult {
  const parsed = cancelReservationInputSchema.safeParse(payload);

  if (!parsed.success) {
    return {
      status: 400,
      error: platformErrorBody(
        "validation_failed",
        "Invalid reservation cancel data.",
        400,
        { issues: toJsonSafeValidationIssues(parsed.error.issues) },
      ),
    };
  }

  return {
    status: 200,
    input: parsed.data,
  };
}

export function toPlatformCancelledReservation(payload: unknown) {
  const record = payload && typeof payload === "object" && "data" in payload
    ? (payload as { data: unknown }).data
    : payload;
  return toPlatformReservation(record);
}

export function prepareReservationUpdatePatch(payload: unknown): ReservationPatchPreparationResult {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {
      status: 400,
      error: platformErrorBody(
        "validation_failed",
        "Reservation PATCH payload must be a JSON object.",
        400,
      ),
    };
  }

  if (hasMovementPatchFields(payload)) {
    return {
      status: 400,
      error: platformErrorBody(
        "validation_failed",
        "Use rescheduleReservation for date, time, quantity, or resource assignment changes.",
        400,
      ),
    };
  }

  const unsupportedField = getUnsupportedPatchField(payload);
  if (unsupportedField) {
    return {
      status: 400,
      error: platformErrorBody(
        "validation_failed",
        `Reservation PATCH field ${unsupportedField} is not supported by the current compatibility shim.`,
        400,
      ),
    };
  }

  const legacyPatch = toLegacyBookingUpdatePatch(payload as UpdateReservationPatch);
  if (Object.keys(legacyPatch).length === 0) {
    return {
      status: 400,
      error: platformErrorBody(
        "validation_failed",
        "Reservation PATCH must include customer.name, customer.email, or status in the current compatibility shim.",
        400,
      ),
    };
  }

  return {
    status: 200,
    legacyPatch,
  };
}

function getUnsupportedPatchField(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const record = payload as Record<string, unknown>;
  for (const field of Object.keys(record)) {
    if (!supportedPatchFields.has(field)) {
      return field;
    }
  }

  const customer = record.customer;
  if (customer && typeof customer === "object" && !Array.isArray(customer)) {
    for (const field of Object.keys(customer)) {
      if (!supportedCustomerPatchFields.has(field)) {
        return `customer.${field}`;
      }
    }
  }

  return null;
}

function toJsonSafeValidationIssues(issues: Array<{ code: string; message: string; path: Array<string | number> }>) {
  return issues.map((issue) => ({
    code: issue.code,
    message: issue.message,
    path: issue.path,
  }));
}
