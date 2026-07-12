import type { BookingConfirmationAction, BookingData } from "./actions.js";
import { PREPARE_BOOKING_TOOL_NAME } from "./tool-schemas.js";

export interface PreparedBookingPayload {
  ready_for_confirmation: true;
  service_id?: string;
  service_name: string;
  date: string;
  start_time: string;
  seats: number;
  user_name: string;
  user_email: string;
  user_phone: string;
}

export interface PrepareBookingInput {
  service_id?: string;
  service_name: string;
  date: string;
  start_time: string;
  seats: number;
  user_name: string;
  user_email: string;
  user_phone: string;
}

export interface PreparedBookingAvailabilityBinding {
  service_id: string;
  service_name: string;
  available_slots: Array<{
    start_time: string;
    end_time: string;
    available_quantity: number;
    is_available: boolean;
  }>;
}

export interface BoundPreparedBooking extends PrepareBookingInput {
  service_id: string;
  end_time: string;
}

export interface PreparedBookingToolCall {
  function: {
    name: string;
    arguments?: string;
  };
}

export interface ExtractPreparedBookingToolCallOptions {
  toolName?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidDateString(value: unknown): value is string {
  const normalizedValue = typeof value === "string" ? value.trim() : value;

  if (!isNonEmptyString(normalizedValue) || !/^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)) {
    return false;
  }

  const [yearText, monthText, dayText] = normalizedValue.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isValidTimeString(value: unknown): value is string {
  const normalizedValue = typeof value === "string" ? value.trim() : value;

  if (!isNonEmptyString(normalizedValue)) {
    return false;
  }

  const match = /^(\d{2}):(\d{2})$/.exec(normalizedValue);
  if (!match) {
    return false;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function isValidEmailString(value: unknown): value is string {
  const normalizedValue = typeof value === "string" ? value.trim() : value;

  return (
    isNonEmptyString(normalizedValue) &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedValue)
  );
}

function isValidSeatCount(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value > 0
  );
}

export function parseJsonRecord(content: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(content);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function parsePreparedBookingPayload(value: unknown): PreparedBookingPayload | null {
  if (!isRecord(value) || value.ready_for_confirmation !== true) {
    return null;
  }

  const input = parsePrepareBookingInput(value);

  return input
    ? {
        ready_for_confirmation: true,
        ...input,
      }
    : null;
}

export function parsePrepareBookingInput(value: unknown): PrepareBookingInput | null {
  if (!isRecord(value)) {
    return null;
  }

  const serviceName = value.service_name;
  const serviceId = value.service_id;
  const date = value.date;
  const startTime = value.start_time;
  const seats = value.seats;
  const userName = value.user_name;
  const userEmail = value.user_email;
  const userPhone = value.user_phone;

  if (
    !isNonEmptyString(serviceName) ||
    (serviceId !== undefined && !isNonEmptyString(serviceId)) ||
    !isValidDateString(date) ||
    !isValidTimeString(startTime) ||
    !isValidSeatCount(seats) ||
    !isNonEmptyString(userName) ||
    !isValidEmailString(userEmail) ||
    !isNonEmptyString(userPhone)
  ) {
    return null;
  }

  return {
    ...(isNonEmptyString(serviceId) ? { service_id: serviceId.trim() } : {}),
    service_name: serviceName.trim(),
    date: date.trim(),
    start_time: startTime.trim(),
    seats,
    user_name: userName.trim(),
    user_email: userEmail.trim(),
    user_phone: userPhone.trim(),
  };
}

export function bindPreparedBookingToAvailability(
  value: PrepareBookingInput,
  availability: PreparedBookingAvailabilityBinding,
): BoundPreparedBooking | null {
  if (
    value.service_id !== undefined && value.service_id !== availability.service_id
    || value.service_name.trim().toLocaleLowerCase() !== availability.service_name.trim().toLocaleLowerCase()
  ) {
    return null;
  }
  const slot = availability.available_slots.find((candidate) =>
    candidate.is_available
    && candidate.start_time === value.start_time
    && candidate.available_quantity >= value.seats
  );
  if (!slot) return null;
  return {
    ...value,
    service_id: availability.service_id,
    service_name: availability.service_name,
    end_time: slot.end_time,
  };
}

export function parsePreparedBookingPayloadJson(content: string): PreparedBookingPayload | null {
  return parsePreparedBookingPayload(parseJsonRecord(content));
}

export function bookingDataFromPreparedBookingPayload(
  payload: PrepareBookingInput
): BookingData {
  return {
    service: payload.service_name,
    date: payload.date,
    time: payload.start_time,
    seats: payload.seats,
    name: payload.user_name,
    email: payload.user_email,
    phone: payload.user_phone,
  };
}

export function bookingConfirmationActionFromPreparedBookingPayload(
  payload: PreparedBookingPayload
): BookingConfirmationAction {
  return {
    type: "booking_confirmation",
    data: bookingDataFromPreparedBookingPayload(payload),
  };
}

export function extractPreparedBookingActionFromToolCalls(
  toolCalls: PreparedBookingToolCall[],
  options: ExtractPreparedBookingToolCallOptions = {}
): BookingConfirmationAction | null {
  const toolName = options.toolName ?? PREPARE_BOOKING_TOOL_NAME;

  for (const toolCall of toolCalls) {
    if (toolCall.function.name !== toolName) {
      continue;
    }

    const payload = parsePrepareBookingInput(
      parseJsonRecord(toolCall.function.arguments ?? "{}")
    );
    return payload
      ? {
          type: "booking_confirmation",
          data: bookingDataFromPreparedBookingPayload(payload),
        }
      : null;
  }

  return null;
}
