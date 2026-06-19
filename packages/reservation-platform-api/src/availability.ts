import {
  generateAvailabilityTimeSlots,
  type Reservation,
  type ReservationService,
} from "@project-play/reservations-core";
import type { AvailabilityResponse } from "@reservation-platform/contract-types";
import { platformErrorBody } from "./errors.js";
import { toPlatformAvailabilityResponse } from "./platform-adapters.js";

export type AvailabilityQuerySearchParamsInput =
  | URL
  | URLSearchParams
  | string
  | string[][]
  | Record<string, string>;

export interface AvailabilityReadInput {
  serviceId: string;
  date: string;
}

export interface AvailabilityRead {
  service: ReservationService;
  bookings: Reservation[];
  maintenanceResourceLabels: string[];
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

  try {
    const resolvedRepository = typeof repository === "function" ? repository() : repository;
    const availability = await resolvedRepository.readAvailability({ serviceId, date });
    const timeSlots = generateAvailabilityTimeSlots(
      availability.service,
      availability.bookings,
      {
        maintenanceResourceLabels: availability.maintenanceResourceLabels,
        legacyFallbackLabels: getLegacyFallbackLabels(availability.service),
      },
    );

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
