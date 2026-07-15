import {
  generateAvailabilityTimeSlots,
  type Reservation,
  type ReservationService,
} from "@project-play/reservations-core";
import type { AvailabilityResponse } from "@reservation-platform/contract-types";
import type { ExperienceOperatingHoursInput } from "@reservation-platform/contract-types";
import { platformErrorBody } from "./errors.js";
import { toPlatformAvailabilityResponse } from "./platform-adapters.js";

export type AvailabilityQuerySearchParamsInput =
  | URL
  | URLSearchParams
  | string
  | Iterable<[string, string]>
  | Record<string, string | readonly string[]>;

export interface AvailabilityReadInput {
  serviceId: string;
  date: string;
  venueId?: string;
  staffId?: string;
}

export interface AvailabilityRead {
  service: ReservationService;
  bookings: Reservation[];
  maintenanceResourceLabels: string[];
  operatingHours?: ExperienceOperatingHoursInput;
  durationMinutes?: number;
  staffUnavailable?: boolean;
}

export interface AvailabilityRepositoryPort {
  readAvailability(input: AvailabilityReadInput): Promise<AvailabilityRead>;
}

export type AvailabilityQueryPreparationResult = {
  status: 200;
  searchParams: URLSearchParams;
  queryString: string;
} | {
  status: 400;
  error: ReturnType<typeof platformErrorBody>;
};

export type AvailabilityServiceResult = {
  status: number;
  body: AvailabilityResponse | ReturnType<typeof platformErrorBody>;
  cause?: unknown;
};

export interface ListAvailabilityInput {
  repository: AvailabilityRepositoryPort | (() => AvailabilityRepositoryPort);
  query: AvailabilityQuerySearchParamsInput;
  now?: Date;
  venueId?: string;
}

export function prepareAvailabilityQuery(
  input: AvailabilityQuerySearchParamsInput,
): AvailabilityQueryPreparationResult {
  const searchParams = cloneAvailabilitySearchParams(input);
  const startAt = searchParams.get("start_at");

  if (!searchParams.get("date") && startAt) {
    const derivedDate = startAt.slice(0, 10);
    if (isDateString(derivedDate)) {
      searchParams.set("date", derivedDate);
    }
  }

  if (!searchParams.get("service_id") || !searchParams.get("date")) {
    return {
      status: 400,
      error: platformErrorBody(
        "validation_failed",
        "service_id and date are required.",
        400,
      ),
    };
  }

  return {
    status: 200,
    searchParams,
    queryString: searchParams.toString(),
  };
}

export async function listAvailability({
  repository,
  query,
  now = new Date(),
  venueId,
}: ListAvailabilityInput): Promise<AvailabilityServiceResult> {
  const preparedQuery = prepareAvailabilityQuery(query);
  if (preparedQuery.status !== 200) {
    return {
      status: preparedQuery.status,
      body: preparedQuery.error,
    };
  }

  const serviceId = preparedQuery.searchParams.get("service_id")!;
  const date = preparedQuery.searchParams.get("date")!;
  const staffId = preparedQuery.searchParams.get("staff_id") ?? undefined;

  try {
    const resolvedRepository = typeof repository === "function" ? repository() : repository;
    const availability = await resolvedRepository.readAvailability({
      serviceId,
      date,
      ...(venueId ? { venueId } : {}),
      ...(staffId ? { staffId } : {}),
    });
    const windows = availability.operatingHours
      ? getOperatingWindowsForDate(availability.operatingHours, date, now)
      : undefined;
    const timeSlots = windows === null ? [] : generateAvailabilityTimeSlots(
      availability.service,
      availability.bookings,
      {
        ...(windows ? {
          operatingWindows: windows,
          durationMinutes: availability.durationMinutes ?? 60,
        } : {}),
        maintenanceResourceLabels: availability.maintenanceResourceLabels,
        legacyFallbackLabels: getLegacyFallbackLabels(availability.service),
        ...(staffId ? {
          staffId,
          bufferBeforeMinutes: availability.service.buffer_before_minutes ?? 0,
          bufferAfterMinutes: availability.service.buffer_after_minutes ?? 0,
          staffUnavailable: availability.staffUnavailable ?? false,
        } : {}),
      },
    ).filter((slot) => (
      !availability.operatingHours
      || minutesUntilLocalSlot(availability.operatingHours.timezone, date, slot.start_time, now)
        >= availability.operatingHours.minimum_notice_minutes
    ));

    return {
      status: 200,
      body: toPlatformAvailabilityResponse({
        timeSlots,
        totalSeats: availability.service.total_seats,
        ...getAvailabilityMetadata(availability.service),
      }),
    };
  } catch (error) {
    const status = availabilityStorageErrorStatus(error);
    return {
      status,
      body: platformErrorBody(
        status === 404 ? "not_found" : "internal_error",
        status === 404 ? "Service not found" : "Failed to check availability",
        status,
      ),
      cause: error,
    };
  }
}

export function getOperatingWindowsForDate(
  schedule: ExperienceOperatingHoursInput,
  date: string,
  now: Date,
): Array<{ start_time: string; end_time: string; interval_minutes: number }> | null {
  if (schedule.closures.some((closure) => closure.date === date)) return null;
  const localNow = localDateAndMinutes(schedule.timezone, now);
  const requestedDay = dateOrdinal(date);
  const currentDay = dateOrdinal(localNow.date);
  if (requestedDay < currentDay || requestedDay - currentDay > schedule.booking_horizon_days) return null;
  const dayOfWeek = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return schedule.intervals
    .filter((interval) => interval.day_of_week === dayOfWeek)
    .map((interval) => ({
      start_time: interval.start_time,
      end_time: interval.end_time,
      interval_minutes: schedule.slot_interval_minutes,
    }));
}

function minutesUntilLocalSlot(timezone: string, date: string, time: string, now: Date) {
  const localNow = localDateAndMinutes(timezone, now);
  return (dateOrdinal(date) - dateOrdinal(localNow.date)) * 1440
    + timeMinutes(time)
    - localNow.minutes;
}

function localDateAndMinutes(timezone: string, value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)!.value;
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    minutes: Number(part("hour")) * 60 + Number(part("minute")),
  };
}

function dateOrdinal(value: string) {
  return Math.floor(Date.parse(`${value}T00:00:00.000Z`) / 86_400_000);
}

function timeMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours! * 60 + minutes!;
}

export function getLegacyFallbackLabels(service: ReservationService) {
  return service.resources && service.resources.length > 0
    ? service.resources.map((resource) => resource.label).reverse()
    : Array.from(
        { length: service.total_seats },
        (_, index) => `RS${service.total_seats - index}`,
      );
}

export function getAvailabilityMetadata(service: ReservationService) {
  return {
    resource_kind: service.resource_kind,
    selection_mode: service.selection_mode,
    reservation_policy: service.policy,
    resources: service.resources ?? [],
    layout: service.layout,
  };
}

function cloneAvailabilitySearchParams(input: AvailabilityQuerySearchParamsInput) {
  if (input instanceof URL) {
    return new URLSearchParams(input.searchParams);
  }

  return new URLSearchParams(input);
}

function isDateString(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function availabilityStorageErrorStatus(error: unknown) {
  if (!error || typeof error !== "object") {
    return 500;
  }

  const maybeError = error as { code?: string; message?: string; status?: number };
  if (
    maybeError.status === 404 ||
    maybeError.code === "PGRST116" ||
    maybeError.message?.includes("JSON object requested, multiple (or no) rows returned") === true
  ) {
    return 404;
  }

  return 500;
}
