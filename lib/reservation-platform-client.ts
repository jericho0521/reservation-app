import type {
  AvailabilityResponse as PlatformAvailabilityResponse,
  AvailabilitySlot,
  CreateReservationInput,
  ListReservationsResponse,
  ListResourceMaintenanceResponse,
  ListServicesResponse,
  PlatformErrorBody,
  ReservationListSummary,
  ReservationResponse,
  ResourceLayoutResponse,
  ResourceResponse,
  ServiceResponse,
} from "@reservation-platform/contract-types";
import {
  createReservationPlatformClient,
  type RequestOptions as ReservationPlatformRequestOptions,
} from "@reservation-platform/sdk";
import type { AdminBooking } from "@/app/admin/dashboard-data";
import type {
  AvailabilityResponse,
  Booking,
  ReservationPolicy,
  ReservableResource,
  ResourceLayout,
  Service,
  TimeSlot,
} from "@/types";

export interface LegacyMaintenanceSeatRow {
  maintenance_id?: string;
  seat_label: string;
  reason?: string | null;
}

export type ReservationApiMode = "local" | "platform";
export type AdminReservationsList = AdminBooking[] & {
  summary?: ReservationListSummary;
};

export interface ReservationPlatformContext {
  tenantId?: string;
  venueId?: string;
  correlationId?: string;
}

export function getReservationApiMode(
  env?: Pick<NodeJS.ProcessEnv, "NEXT_PUBLIC_RESERVATION_API_MODE">,
): ReservationApiMode {
  const configuredMode = env
    ? env.NEXT_PUBLIC_RESERVATION_API_MODE
    : process.env.NEXT_PUBLIC_RESERVATION_API_MODE;

  return configuredMode === "platform" ? "platform" : "local";
}

export function getReservationPlatformContext(
  env?: Pick<
    NodeJS.ProcessEnv,
    "NEXT_PUBLIC_RESERVATION_TENANT_ID" | "NEXT_PUBLIC_RESERVATION_VENUE_ID"
  >,
): ReservationPlatformContext {
  const tenantId = env
    ? env.NEXT_PUBLIC_RESERVATION_TENANT_ID
    : process.env.NEXT_PUBLIC_RESERVATION_TENANT_ID;
  const venueId = env
    ? env.NEXT_PUBLIC_RESERVATION_VENUE_ID
    : process.env.NEXT_PUBLIC_RESERVATION_VENUE_ID;

  return {
    tenantId: tenantId || undefined,
    venueId: venueId || undefined,
  };
}

export function getReservationPlatformBaseUrl(
  env?: Pick<NodeJS.ProcessEnv, "NEXT_PUBLIC_RESERVATION_PLATFORM_BASE_URL">,
) {
  const configuredBaseUrl = env
    ? env.NEXT_PUBLIC_RESERVATION_PLATFORM_BASE_URL
    : process.env.NEXT_PUBLIC_RESERVATION_PLATFORM_BASE_URL;

  return normalizeBaseUrl(configuredBaseUrl);
}

export function getReservationApiBasePath(mode: ReservationApiMode = getReservationApiMode()) {
  return mode === "platform" ? getReservationPlatformApiBasePath() : "/api";
}

function normalizeBaseUrl(baseUrl?: string) {
  return baseUrl?.trim().replace(/\/+$/, "") ?? "";
}

function getReservationPlatformApiBasePath(baseUrl = getReservationPlatformBaseUrl()) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  return normalizedBaseUrl && isAbsoluteBaseUrl(normalizedBaseUrl) ? `${normalizedBaseUrl}/v1` : "/api/v1";
}

function getReservationPlatformCompatibilityApiBasePath(baseUrl?: string) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  return normalizedBaseUrl ? `${normalizedBaseUrl}/api/v1` : "/api/v1";
}

function isAbsoluteBaseUrl(baseUrl: string) {
  try {
    const url = new URL(baseUrl);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function createConfiguredReservationPlatformClient(baseUrl = getReservationPlatformBaseUrl()) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  if (!normalizedBaseUrl || !isAbsoluteBaseUrl(normalizedBaseUrl)) {
    return undefined;
  }

  return createReservationPlatformClient({ baseUrl: normalizedBaseUrl });
}

async function readJson(response: Response) {
  try {
    return await response.json() as unknown;
  } catch {
    return null;
  }
}

function getErrorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object" || !("error" in payload)) {
    return fallback;
  }

  const error = (payload as { error: unknown }).error;
  if (typeof error === "string") {
    return error;
  }
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as PlatformErrorBody).message;
    return typeof message === "string" ? message : fallback;
  }

  return fallback;
}

async function fetchJson<T>(url: string, init: RequestInit | undefined, fallbackError: string): Promise<T> {
  const response = await fetch(url, init);
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, fallbackError));
  }

  return payload as T;
}

function mergeHeaders(base: HeadersInit | undefined, extra: HeadersInit) {
  const headers = new Headers(base);
  new Headers(extra).forEach((value, key) => headers.set(key, value));
  return headers;
}

function createCorrelationId(prefix = "frontend") {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function platformContextHeaders(context: ReservationPlatformContext = getReservationPlatformContext()) {
  const headers = new Headers();

  if (context.tenantId) {
    headers.set("X-Reservation-Tenant-Id", context.tenantId);
  }
  if (context.venueId) {
    headers.set("X-Reservation-Venue-Id", context.venueId);
  }
  headers.set("X-Correlation-Id", context.correlationId ?? createCorrelationId());

  return headers;
}

function withPlatformContext(init?: RequestInit, context?: ReservationPlatformContext): RequestInit {
  return {
    ...init,
    headers: mergeHeaders(init?.headers, platformContextHeaders(context)),
  };
}

function createPlatformRequestOptions(
  input: {
    context?: ReservationPlatformContext;
    headers?: HeadersInit;
    signal?: AbortSignal;
    idempotencyKey?: string;
  } = {},
): ReservationPlatformRequestOptions {
  const context = input.context ?? getReservationPlatformContext();
  return {
    tenantId: context.tenantId,
    venueId: context.venueId,
    correlationId: context.correlationId ?? createCorrelationId(),
    idempotencyKey: input.idempotencyKey,
    headers: input.headers,
    signal: input.signal,
  };
}

function createIdempotencyKey(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function numberFromMetadata(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringFromMetadata(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function platformResourceToLegacyResource(resource: ResourceResponse): ReservableResource {
  return {
    id: resource.resource_id,
    service_id: resource.service_id ?? "",
    label: resource.label,
    kind: resource.kind,
    is_active: resource.is_active,
    capacity: resource.capacity,
    metadata: resource.metadata,
  };
}

function platformLayoutToLegacyLayout(layout?: ResourceLayoutResponse): ResourceLayout | undefined {
  if (!layout) {
    return undefined;
  }

  const metadata = layout.metadata ?? {};
  if (layout.kind === "grid") {
    return {
      kind: "grid",
      columns: numberFromMetadata(metadata.columns) ?? 1,
      rows: numberFromMetadata(metadata.rows),
      group_label: stringFromMetadata(metadata.group_label),
    };
  }

  if (layout.kind === "custom") {
    return {
      kind: "custom",
      positions: (layout.resources ?? [])
        .filter((resource) => typeof resource.x === "number" && typeof resource.y === "number")
        .map((resource) => ({
          resource_id: resource.resource_id,
          x: resource.x ?? 0,
          y: resource.y ?? 0,
          group_label: typeof resource.metadata?.group_label === "string"
            ? resource.metadata.group_label
            : undefined,
        })),
    };
  }

  return { kind: "none" };
}

function platformPolicyToLegacyPolicy(value: unknown): ReservationPolicy | undefined {
  return isRecord(value) && typeof value.kind === "string"
    ? value as unknown as ReservationPolicy
    : undefined;
}

function adminReservationsList(
  bookings: AdminBooking[],
  summary?: ReservationListSummary,
): AdminReservationsList {
  if (!summary) {
    return bookings as AdminReservationsList;
  }

  Object.defineProperty(bookings, "summary", {
    value: summary,
    enumerable: false,
  });
  return bookings as AdminReservationsList;
}

export function platformServiceToLegacyService(service: ServiceResponse): Service {
  return {
    id: service.service_id,
    name: service.name,
    description: service.description,
    total_seats: service.total_quantity ?? numberFromMetadata(service.metadata?.total_seats) ?? 0,
    created_at: stringFromMetadata(service.metadata?.created_at) ?? "",
    resource_kind: service.resource_kind,
    selection_mode: service.resource_strategy === "assigned_resource" || service.resource_strategy === "hybrid"
      ? service.resource_strategy
      : "quantity",
    reservation_policy: platformPolicyToLegacyPolicy(service.reservation_policy),
    resources: service.resources?.map(platformResourceToLegacyResource),
    layout: platformLayoutToLegacyLayout(service.layout),
  };
}

export function platformAvailabilityToLegacyAvailability(
  response: PlatformAvailabilityResponse,
): AvailabilityResponse {
  return {
    timeSlots: response.slots.map(platformSlotToLegacySlot),
    totalSeats: response.total_quantity,
    resource_kind: response.resource_kind,
    selection_mode: response.resource_strategy,
    reservation_policy: platformPolicyToLegacyPolicy(response.reservation_policy),
    resources: response.resources?.map(platformResourceToLegacyResource),
    layout: platformLayoutToLegacyLayout(response.layout),
  };
}

function platformSlotToLegacySlot(slot: AvailabilitySlot): TimeSlot {
  return {
    start_time: slot.start_time ?? slot.start_at?.slice(11, 16) ?? "",
    end_time: slot.end_time ?? slot.end_at?.slice(11, 16) ?? "",
    available_seats: slot.available_quantity,
    is_available: slot.is_available,
    taken_seat_labels: slot.taken_resource_labels ?? [],
    maintenance_seat_labels: slot.maintenance_resource_labels ?? [],
  };
}

export function legacyBookingToPlatformInput(booking: Partial<Booking> & {
  selected_seat_labels?: string[];
}): CreateReservationInput {
  return {
    service_id: booking.service_id ?? "",
    date: booking.booking_date,
    start_time: booking.start_time,
    end_time: booking.end_time,
    quantity: booking.seats_booked ?? 1,
    reservation_items: booking.selected_seat_labels?.map((resource_label) => ({
      resource_label,
      quantity: 1,
    })),
    customer: {
      name: booking.user_name,
      email: booking.user_email,
      phone: booking.user_phone,
    },
  };
}

export function platformReservationToAdminBooking(reservation: ReservationResponse): AdminBooking {
  return {
    id: reservation.reservation_id,
    user_name: reservation.customer?.name ?? "Guest",
    user_email: reservation.customer?.email ?? "",
    user_phone: reservation.customer?.phone,
    booking_date: reservation.date ?? reservation.start_at?.slice(0, 10) ?? "",
    start_time: reservation.start_time ?? reservation.start_at?.slice(11, 16) ?? "",
    end_time: reservation.end_time ?? reservation.end_at?.slice(11, 16) ?? "",
    seats_booked: reservation.quantity,
    seat_labels: reservation.reservation_items
      ?.map((item) => item.resource_label ?? item.resource_id)
      .filter((label): label is string => typeof label === "string"),
    status: reservation.status,
    services: typeof reservation.metadata?.service_name === "string"
      ? { name: reservation.metadata.service_name }
      : null,
  };
}

export async function listReservationServices(mode: ReservationApiMode = getReservationApiMode()) {
  if (mode === "local") {
    return fetchJson<Service[]>("/api/services", undefined, "Failed to load services");
  }

  const client = createConfiguredReservationPlatformClient();
  if (client) {
    const response = await client.listServices(undefined, createPlatformRequestOptions());
    return response.services.map(platformServiceToLegacyService);
  }

  const response = await fetchJson<ListServicesResponse>(
    `${getReservationPlatformApiBasePath()}/services`,
    withPlatformContext(),
    "Failed to load services",
  );
  return response.services.map(platformServiceToLegacyService);
}

export async function listResourceMaintenanceSeats(
  serviceId: string,
  mode: ReservationApiMode = getReservationApiMode(),
) {
  if (mode === "local") {
    const response = await fetchJson<{ seats?: LegacyMaintenanceSeatRow[] }>(
      `/api/seat-maintenance?service_id=${encodeURIComponent(serviceId)}`,
      undefined,
      "Failed to load maintenance seats",
    );
    return response.seats ?? [];
  }

  const client = createConfiguredReservationPlatformClient();
  const response = client
    ? await client.listResourceMaintenance({ service_id: serviceId }, createPlatformRequestOptions())
    : await fetchJson<ListResourceMaintenanceResponse>(
      `${getReservationPlatformApiBasePath()}/resource-maintenance?service_id=${encodeURIComponent(serviceId)}`,
      withPlatformContext(),
      "Failed to load maintenance resources",
    );

  return response.maintenance
    .map((item): LegacyMaintenanceSeatRow | null => {
      const label = typeof item.metadata?.resource_label === "string"
        ? item.metadata.resource_label
        : item.resource_id;

      return label
        ? { maintenance_id: item.maintenance_id, seat_label: label, reason: item.reason }
        : null;
    })
    .filter((item): item is LegacyMaintenanceSeatRow => item !== null);
}

export async function saveResourceMaintenanceSeats(
  input: {
    serviceId: string;
    seatLabels: string[];
    reason?: string;
  },
  mode: ReservationApiMode = getReservationApiMode(),
) {
  const sortedLabels = Array.from(new Set(input.seatLabels));

  if (mode === "local") {
    const response = await fetchJson<{ seat_labels?: string[] }>("/api/seat-maintenance", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_id: input.serviceId,
        seat_labels: sortedLabels,
        reason: input.reason,
      }),
    }, "Failed to save seat maintenance");
    return response.seat_labels ?? [];
  }

  const current = await listResourceMaintenanceSeats(input.serviceId, "platform");
  const nextLabels = new Set(sortedLabels);

  const normalizedReason = input.reason ?? null;
  const currentByLabel = new Map(current.map((item) => [item.seat_label, item]));
  const labelsToCreate = sortedLabels.filter((label) => {
    const currentItem = currentByLabel.get(label);
    return !currentItem || (currentItem.reason ?? null) !== normalizedReason;
  });
  const maintenanceToEnd = current.filter((item) =>
    item.maintenance_id && !nextLabels.has(item.seat_label)
  );

  const client = createConfiguredReservationPlatformClient();
  if (client) {
    await Promise.all([
      ...labelsToCreate.map((label) => client.createResourceMaintenance({
        service_id: input.serviceId,
        reason: input.reason,
        metadata: {
          resource_label: label,
        },
      }, createPlatformRequestOptions({
        idempotencyKey: createIdempotencyKey(`resource-maintenance-create-${input.serviceId}-${label}`),
      }))),
      ...maintenanceToEnd.map((item) => client.endResourceMaintenance(item.maintenance_id ?? "", {
        reason: input.reason,
      }, createPlatformRequestOptions({
        idempotencyKey: createIdempotencyKey(`resource-maintenance-end-${item.maintenance_id}`),
      }))),
    ]);
  } else {
    await Promise.all([
      ...labelsToCreate.map((label) => fetchJson(
        `${getReservationPlatformApiBasePath()}/resource-maintenance`,
        withPlatformContext({
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": createIdempotencyKey(`resource-maintenance-create-${input.serviceId}-${label}`),
          },
          body: JSON.stringify({
            service_id: input.serviceId,
            reason: input.reason,
            metadata: {
              resource_label: label,
            },
          }),
        }),
        "Failed to create resource maintenance",
      )),
      ...maintenanceToEnd.map((item) => fetchJson(
        `${getReservationPlatformApiBasePath()}/resource-maintenance/${encodeURIComponent(item.maintenance_id ?? "")}/end`,
        withPlatformContext({
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": createIdempotencyKey(`resource-maintenance-end-${item.maintenance_id}`),
          },
          body: JSON.stringify({
            reason: input.reason,
          }),
        }),
        "Failed to end resource maintenance",
      )),
    ]);
  }

  return sortedLabels;
}

export async function getReservationAvailability(
  serviceId: string,
  date: string,
  mode: ReservationApiMode = getReservationApiMode(),
) {
  const client = mode === "platform" ? createConfiguredReservationPlatformClient() : undefined;
  if (client) {
    const response = await client.listAvailability({
      service_id: serviceId,
      date,
    }, createPlatformRequestOptions());
    return platformAvailabilityToLegacyAvailability(response);
  }

  const basePath = getReservationApiBasePath(mode);
  const response = await fetchJson<AvailabilityResponse | PlatformAvailabilityResponse>(
    `${basePath}/availability?service_id=${encodeURIComponent(serviceId)}&date=${encodeURIComponent(date)}`,
    mode === "platform" ? withPlatformContext() : undefined,
    "Failed to fetch time slots",
  );

  return mode === "platform"
    ? platformAvailabilityToLegacyAvailability(response as PlatformAvailabilityResponse)
    : response as AvailabilityResponse;
}

export async function createReservationFromBookingForm(
  booking: Partial<Booking> & { selected_seat_labels?: string[] },
  mode: ReservationApiMode = getReservationApiMode(),
) {
  if (mode === "local") {
    return fetchJson("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_id: booking.service_id,
        user_name: booking.user_name,
        user_email: booking.user_email,
        user_phone: booking.user_phone,
        booking_date: booking.booking_date,
        start_time: booking.start_time,
        end_time: booking.end_time,
        seats_booked: booking.seats_booked,
        seat_labels: booking.selected_seat_labels ?? [],
        interface_type: booking.interface_type,
      }),
    }, "Booking failed. Please try again.");
  }

  const client = createConfiguredReservationPlatformClient();
  if (client) {
    return client.createReservation(legacyBookingToPlatformInput(booking), createPlatformRequestOptions({
      idempotencyKey: createIdempotencyKey("reservation-create"),
    }));
  }

  return fetchJson(`${getReservationPlatformApiBasePath()}/reservations`, withPlatformContext({
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": createIdempotencyKey("reservation-create"),
    },
    body: JSON.stringify(legacyBookingToPlatformInput(booking)),
  }), "Booking failed. Please try again.");
}

export async function updateReservationStatus(
  reservationId: string,
  status: string,
  mode: ReservationApiMode = getReservationApiMode(),
) {
  if (mode === "local") {
    return fetchJson(`/api/bookings/${encodeURIComponent(reservationId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }, "Failed to update booking status");
  }

  const client = createConfiguredReservationPlatformClient();
  if (client) {
    return client.updateReservation(reservationId, { status }, createPlatformRequestOptions({
      idempotencyKey: createIdempotencyKey(`reservation-update-${reservationId}`),
    }));
  }

  return fetchJson(`${getReservationPlatformApiBasePath()}/reservations/${encodeURIComponent(reservationId)}`, withPlatformContext({
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": createIdempotencyKey(`reservation-update-${reservationId}`),
    },
    body: JSON.stringify({ status }),
  }), "Failed to update booking status");
}

export async function listAdminReservations(
  input: {
    search?: string;
    signal?: AbortSignal;
    baseUrl?: string;
    platformBaseUrl?: string;
    headers?: HeadersInit;
  } = {},
  mode: ReservationApiMode = getReservationApiMode(),
) {
  const search = input.search?.trim();
  const query = search ? `?search=${encodeURIComponent(search)}` : "";

  if (mode === "local") {
    const baseUrl = input.baseUrl ?? "";
    const bookings = await fetchJson<AdminBooking[]>(
      `${baseUrl}/api/bookings${query}`,
      input.signal || input.headers
        ? { signal: input.signal, headers: input.headers }
        : undefined,
      "Failed to load bookings",
    );
    return adminReservationsList(bookings);
  }

  const configuredBaseUrl = getReservationPlatformBaseUrl();
  let platformBaseUrl = "";
  if (isAbsoluteBaseUrl(configuredBaseUrl)) {
    platformBaseUrl = configuredBaseUrl;
  } else if (input.platformBaseUrl && isAbsoluteBaseUrl(input.platformBaseUrl)) {
    platformBaseUrl = input.platformBaseUrl;
  }

  const client = createConfiguredReservationPlatformClient(platformBaseUrl);
  if (client) {
    const response = await client.listReservations(
      search ? { search } : undefined,
      createPlatformRequestOptions({
        headers: input.headers,
        signal: input.signal,
      }),
    );
    return adminReservationsList(
      response.reservations.map(platformReservationToAdminBooking),
      response.summary,
    );
  }

  const basePath = platformBaseUrl
    ? getReservationPlatformApiBasePath(platformBaseUrl)
    : getReservationPlatformCompatibilityApiBasePath(input.baseUrl);
  const response = await fetchJson<ListReservationsResponse>(
    `${basePath}/reservations${query}`,
    withPlatformContext(
      input.signal || input.headers
        ? { signal: input.signal, headers: input.headers }
        : undefined,
    ),
    "Failed to load bookings",
  );
  return adminReservationsList(
    response.reservations.map(platformReservationToAdminBooking),
    response.summary,
  );
}
