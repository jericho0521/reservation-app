import {
  adaptLegacyBooking,
  adaptLegacyService,
  createAssignedResourcePolicy,
  createCapacityPolicy,
  createHybridPolicy,
  validateReservationRequest,
  type CreateReservationInput,
  type LegacyBookingShape,
  type ReservationValidationResult,
  type Reservation,
  type AtomicReservationRepository,
  type ReservationPolicy,
  type ReservationService,
  type ResourceKind,
  type ResourceLayout,
  type ResourceSelectionMode,
  type ReservableResource,
} from "@project-play/reservations-core";

export const RESERVATION_SUPABASE_TABLES = {
  services: "services",
  bookings: "bookings",
  reservableResources: "reservable_resources",
  resourceLayouts: "resource_layouts",
  reservationItems: "reservation_items",
  serviceSeatMaintenance: "service_seat_maintenance",
  serviceAvailabilityRules: "service_availability_rules",
} as const;

export const RESERVATION_SUPABASE_SELECTS = {
  service:
    "id, name, description, total_seats, created_at, resource_kind, selection_mode, reservation_policy",
  booking:
    "id, service_id, user_name, user_email, user_phone, booking_date, start_time, end_time, seats_booked, seat_labels, status, interface_type",
  resource:
    "id, service_id, label, resource_label, kind, resource_kind, status, is_active, capacity, metadata",
  layout: "layout_kind, kind, metadata",
  maintenance: "seat_label",
  availabilityRule:
    "day_of_week, start_time, end_time, interval_minutes, is_active",
} as const;

export interface ServiceMetadataRow {
  id: string;
  name: string;
  description?: string | null;
  total_seats: number;
  created_at: string;
  resource_kind?: ResourceKind | null;
  selection_mode?: ResourceSelectionMode | null;
  reservation_policy?: unknown;
}

export interface ResourceRow {
  id: string;
  service_id: string;
  label?: string | null;
  resource_label?: string | null;
  kind?: ResourceKind | null;
  resource_kind?: ResourceKind | null;
  status?: "available" | "maintenance" | "inactive" | string | null;
  is_active?: boolean | null;
  capacity?: number | null;
  metadata?: Record<string, unknown> | null;
}

export interface LayoutRow {
  layout_kind?: string | null;
  kind?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface MaintenanceRow {
  seat_label?: string | null;
  resource_label?: string | null;
}

export interface AvailabilityRuleRow {
  day_of_week?: number | null;
  start_time: string;
  end_time: string;
  interval_minutes?: number | null;
  is_active?: boolean | null;
}

export interface CreateReservationSupabaseResult {
  reservation: Reservation;
  validation: ReturnType<typeof validateReservationRequest>;
  atomic: false;
}

export type SupabaseAtomicReservationErrorCode =
  | "invalid_service"
  | "invalid_reservation"
  | "invalid_resource_labels"
  | "missing_resource_labels"
  | "maintenance_conflict"
  | "resource_conflict"
  | "not_enough_capacity";

export interface CreateReservationAtomicInput {
  reservation: Reservation;
}

export interface CreateReservationAtomicSuccess {
  ok: true;
  atomic: true;
  booking: LegacyBookingShape;
  reservation: Reservation;
  validation: { ok: true };
}

export interface CreateReservationAtomicFailure {
  ok: false;
  atomic: true;
  reservation: Reservation;
  error: SupabaseAtomicReservationErrorCode;
  message?: string;
  validation: ReservationValidationResult;
}

export type CreateReservationAtomicResult =
  | CreateReservationAtomicSuccess
  | CreateReservationAtomicFailure;

export class SupabaseAtomicReservationError extends Error {
  code: SupabaseAtomicReservationErrorCode;
  validation: ReservationValidationResult;

  constructor(result: CreateReservationAtomicFailure) {
    super(result.message ?? result.error);
    this.name = "SupabaseAtomicReservationError";
    this.code = result.error;
    this.validation = result.validation;
  }
}

export interface SupabaseReservationRepository
  extends AtomicReservationRepository {
  getResources(serviceId: string): Promise<ReservableResource[]>;
  getResourceLayout(serviceId: string): Promise<ResourceLayout>;
  createReservationAtomic(
    input: CreateReservationAtomicInput | CreateReservationInput,
  ): Promise<CreateReservationAtomicResult>;
  createReservationAtomically(
    input: CreateReservationAtomicInput | CreateReservationInput,
  ): Promise<Reservation>;
  createReservationWithValidation(
    input: CreateReservationInput,
  ): Promise<CreateReservationSupabaseResult>;
}

interface SupabaseLikeClient {
  from(table: string): unknown;
  rpc?(
    fn: string,
    params?: Record<string, unknown>,
  ): Promise<QueryResult<unknown>>;
}

interface SupabaseQueryBuilder {
  select(columns?: string): SupabaseQueryBuilder;
  eq(column: string, value: unknown): SupabaseQueryBuilder;
  insert(rows: unknown[]): SupabaseQueryBuilder;
  single(): Promise<QueryResult<unknown>>;
  maybeSingle(): Promise<QueryResult<unknown>>;
  then(resolve: (value: QueryResult<unknown>) => unknown): Promise<unknown>;
}

interface QueryResult<T> {
  data: T | null;
  error: { message?: string; code?: string } | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function assertNoSupabaseError<T>(
  result: QueryResult<T>,
  message: string,
): T | null {
  if (result.error) {
    throw new Error(result.error.message ?? message);
  }

  return result.data;
}

function fromTable(client: SupabaseLikeClient, table: string) {
  return client.from(table) as SupabaseQueryBuilder;
}

export function parseReservationPolicy(
  rawPolicy: unknown,
  selectionMode: ResourceSelectionMode,
  totalSeats: number,
): ReservationPolicy {
  if (isRecord(rawPolicy)) {
    const maxQuantity = getNumber(rawPolicy.max_quantity) ?? totalSeats;
    const requireResourceLabels =
      typeof rawPolicy.require_resource_labels === "boolean"
        ? rawPolicy.require_resource_labels
        : selectionMode === "assigned_resource";

    if (selectionMode === "assigned_resource") {
      return createAssignedResourcePolicy(maxQuantity);
    }

    if (selectionMode === "hybrid") {
      return createHybridPolicy(maxQuantity, requireResourceLabels);
    }

    return createCapacityPolicy(maxQuantity);
  }

  if (selectionMode === "assigned_resource") {
    return createAssignedResourcePolicy(totalSeats);
  }

  if (selectionMode === "hybrid") {
    return createHybridPolicy(totalSeats);
  }

  return createCapacityPolicy(totalSeats);
}

export function adaptResourceLayout(layout: LayoutRow | null): ResourceLayout {
  if (!layout) {
    return { kind: "none" };
  }

  const kind = layout.layout_kind ?? layout.kind;
  const metadata = isRecord(layout.metadata) ? layout.metadata : {};

  if (kind === "grid") {
    return {
      kind: "grid",
      columns: getNumber(metadata.columns) ?? 1,
      rows: getNumber(metadata.rows) ?? undefined,
      group_label: getString(metadata.group_label) ?? undefined,
    };
  }

  if (kind === "custom") {
    const positions = Array.isArray(metadata.positions)
      ? metadata.positions
          .filter(isRecord)
          .map((position) => ({
            resource_id: getString(position.resource_id) ?? "",
            x: getNumber(position.x) ?? 0,
            y: getNumber(position.y) ?? 0,
            group_label: getString(position.group_label) ?? undefined,
          }))
          .filter((position) => position.resource_id.length > 0)
      : [];

    return { kind: "custom", positions };
  }

  return { kind: "none" };
}

export function adaptReservableResources(
  resources: ResourceRow[] = [],
  fallbackKind: ResourceKind = "capacity_bucket",
) {
  return resources
    .map((resource): ReservableResource | null => {
      const label = getString(resource.label) ?? getString(resource.resource_label);

      if (!label) {
        return null;
      }

      return {
        id: resource.id,
        service_id: resource.service_id,
        label,
        kind: resource.kind ?? resource.resource_kind ?? fallbackKind,
        is_active: resource.is_active ?? resource.status !== "inactive",
        capacity: resource.capacity ?? 1,
        metadata: resource.metadata ?? undefined,
      };
    })
    .filter((resource): resource is ReservableResource => resource !== null);
}

export function adaptServiceMetadata(
  service: ServiceMetadataRow,
  resources: ResourceRow[] = [],
  layout: LayoutRow | null = null,
  availabilityRules: AvailabilityRuleRow[] = [],
): ReservationService {
  const selectionMode = service.selection_mode ?? "quantity";
  const resourceKind = service.resource_kind ?? (
    selectionMode === "assigned_resource" ? "seat" : "capacity_bucket"
  );
  const policy = parseReservationPolicy(
    service.reservation_policy,
    selectionMode,
    service.total_seats,
  );

  return {
    ...adaptLegacyService(
      {
        id: service.id,
        name: service.name,
        description: service.description ?? undefined,
        total_seats: service.total_seats,
        created_at: service.created_at,
      },
      {
        resource_kind: resourceKind,
        selection_mode: selectionMode,
        policy,
        layout: adaptResourceLayout(layout),
      },
    ),
    resources: adaptReservableResources(resources, resourceKind),
    availability_windows: availabilityRules
      .filter((rule) => rule.is_active !== false)
      .map((rule) => ({
        day_of_week: rule.day_of_week ?? undefined,
        start_time: rule.start_time,
        end_time: rule.end_time,
        interval_minutes: rule.interval_minutes ?? 60,
      })),
  };
}

export function adaptBookingRows(bookings: LegacyBookingShape[]): Reservation[] {
  return bookings.map((booking) => adaptLegacyBooking(booking));
}

export function adaptMaintenanceRows(rows: MaintenanceRow[] = []) {
  return rows
    .map((row) => row.seat_label ?? row.resource_label)
    .filter((label): label is string => typeof label === "string");
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

function reservationToBookingInsert(reservation: Reservation) {
  return {
    service_id: reservation.service_id,
    user_name: reservation.customer_name,
    user_email: reservation.customer_email,
    user_phone: reservation.customer_phone,
    booking_date: reservation.booking_date,
    start_time: reservation.start_time,
    end_time: reservation.end_time,
    seats_booked: reservation.quantity,
    seat_labels: reservation.seat_labels,
    reservation_items: reservation.items.map((item) => ({
      resource_id: item.resource_id ?? null,
      resource_label: item.resource_label ?? null,
      quantity: item.quantity,
    })),
    status: reservation.status ?? "confirmed",
    interface_type: reservation.interface_type,
  };
}

function bookingRowToLegacyBooking(booking: Record<string, unknown>) {
  return {
    id: getString(booking.id) ?? undefined,
    service_id: getString(booking.service_id) ?? "",
    user_name: getString(booking.user_name) ?? "",
    user_email: getString(booking.user_email) ?? "",
    user_phone: getString(booking.user_phone) ?? undefined,
    booking_date: getString(booking.booking_date) ?? "",
    start_time: getString(booking.start_time) ?? "",
    end_time: getString(booking.end_time) ?? "",
    seats_booked: getNumber(booking.seats_booked) ?? 0,
    seat_labels: Array.isArray(booking.seat_labels)
      ? booking.seat_labels.filter((label): label is string => typeof label === "string")
      : [],
    status: getString(booking.status) ?? "confirmed",
    interface_type: booking.interface_type === "chat" ? "chat" : "form",
  } satisfies LegacyBookingShape;
}

function atomicErrorCodeFromUnknown(
  value: unknown,
): SupabaseAtomicReservationErrorCode {
  switch (value) {
    case "invalid_service":
    case "invalid_reservation":
    case "invalid_resource_labels":
    case "missing_resource_labels":
    case "maintenance_conflict":
    case "resource_conflict":
    case "not_enough_capacity":
      return value;
    default:
      return "invalid_reservation";
  }
}

function atomicValidationFromRpc(
  error: SupabaseAtomicReservationErrorCode,
  data: Record<string, unknown>,
): ReservationValidationResult {
  const conflictingLabels = Array.isArray(data.conflicting_resource_labels)
    ? data.conflicting_resource_labels
        .filter((label): label is string => typeof label === "string")
    : undefined;
  const availableQuantity = getNumber(data.available_quantity) ?? undefined;

  return {
    ok: false,
    error: error === "invalid_service" || error === "invalid_reservation" || error === "invalid_resource_labels"
      ? undefined
      : error,
    available_quantity: availableQuantity,
    conflicting_resource_labels: conflictingLabels,
  };
}

function parseAtomicRpcResult(
  raw: unknown,
  requestedReservation: Reservation,
): CreateReservationAtomicResult {
  if (!isRecord(raw)) {
    return {
      ok: false,
      atomic: true,
      reservation: requestedReservation,
      error: "invalid_reservation",
      message: "Atomic reservation RPC returned an invalid response",
      validation: { ok: false },
    };
  }

  if (raw.ok === true && isRecord(raw.booking)) {
    const booking = bookingRowToLegacyBooking(raw.booking);

    return {
      ok: true,
      atomic: true,
      booking,
      reservation: adaptLegacyBooking(booking),
      validation: { ok: true },
    };
  }

  const error = atomicErrorCodeFromUnknown(raw.error_code);

  return {
    ok: false,
    atomic: true,
    reservation: requestedReservation,
    error,
    message: getString(raw.message) ?? undefined,
    validation: atomicValidationFromRpc(error, raw),
  };
}

function reservationToItemInserts(reservation: Reservation, bookingId: string) {
  return reservation.items.map((item) => ({
    booking_id: bookingId,
    service_id: reservation.service_id,
    resource_id: item.resource_id ?? null,
    resource_label: item.resource_label ?? null,
    quantity: item.quantity,
  }));
}

export function createSupabaseReservationRepository(
  client: SupabaseLikeClient,
): SupabaseReservationRepository {
  async function getServiceRows(serviceId: string) {
    const service = assertNoSupabaseError(
      await fromTable(client, RESERVATION_SUPABASE_TABLES.services)
        .select(RESERVATION_SUPABASE_SELECTS.service)
        .eq("id", serviceId)
        .single() as QueryResult<ServiceMetadataRow>,
      "Failed to load service",
    );

    if (!service) {
      return null;
    }

    const resources = assertNoSupabaseError(
      await fromTable(client, RESERVATION_SUPABASE_TABLES.reservableResources)
        .select(RESERVATION_SUPABASE_SELECTS.resource)
        .eq("service_id", serviceId) as QueryResult<ResourceRow[]>,
      "Failed to load reservable resources",
    ) ?? [];

    const layout = assertNoSupabaseError(
      await fromTable(client, RESERVATION_SUPABASE_TABLES.resourceLayouts)
        .select(RESERVATION_SUPABASE_SELECTS.layout)
        .eq("service_id", serviceId)
        .eq("is_active", true)
        .maybeSingle() as QueryResult<LayoutRow>,
      "Failed to load resource layout",
    );

    const rules = assertNoSupabaseError(
      await fromTable(client, RESERVATION_SUPABASE_TABLES.serviceAvailabilityRules)
        .select(RESERVATION_SUPABASE_SELECTS.availabilityRule)
        .eq("service_id", serviceId)
        .eq("is_active", true) as QueryResult<AvailabilityRuleRow[]>,
      "Failed to load service availability rules",
    ) ?? [];

    return { service, resources, layout, rules };
  }

  async function createReservation(reservation: Reservation) {
    const booking = assertNoSupabaseError(
      await fromTable(client, RESERVATION_SUPABASE_TABLES.bookings)
        .insert([reservationToBookingInsert(reservation)])
        .select()
        .single() as QueryResult<LegacyBookingShape>,
      "Failed to create reservation",
    );

    if (!booking) {
      throw new Error("Failed to create reservation");
    }

    const created = adaptLegacyBooking({
      ...booking,
      interface_type: booking.interface_type === "chat" ? "chat" : "form",
    });
    const itemRows = reservationToItemInserts(created, created.id ?? booking.id ?? "");

    if (itemRows.length > 0 && created.id) {
      assertNoSupabaseError(
        await fromTable(client, RESERVATION_SUPABASE_TABLES.reservationItems)
          .insert(itemRows) as QueryResult<unknown>,
        "Failed to create reservation items",
      );
    }

    return created;
  }

  async function createReservationAtomic(
    input: CreateReservationAtomicInput | CreateReservationInput,
  ): Promise<CreateReservationAtomicResult> {
    if (!client.rpc) {
      throw new Error("Supabase client does not support RPC calls");
    }

    const payload = reservationToBookingInsert(input.reservation);
    const data = assertNoSupabaseError(
      await client.rpc("create_reservation_atomic", { payload }),
      "Failed to create reservation atomically",
    );

    return parseAtomicRpcResult(data, input.reservation);
  }

  return {
    async getService(serviceId) {
      const rows = await getServiceRows(serviceId);

      return rows
        ? adaptServiceMetadata(rows.service, rows.resources, rows.layout, rows.rules)
        : null;
    },

    async getResources(serviceId) {
      const data = assertNoSupabaseError(
        await fromTable(client, RESERVATION_SUPABASE_TABLES.reservableResources)
          .select(RESERVATION_SUPABASE_SELECTS.resource)
          .eq("service_id", serviceId) as QueryResult<ResourceRow[]>,
        "Failed to load reservable resources",
      );

      return adaptReservableResources(data ?? []);
    },

    async getResourceLayout(serviceId) {
      const data = assertNoSupabaseError(
        await fromTable(client, RESERVATION_SUPABASE_TABLES.resourceLayouts)
          .select(RESERVATION_SUPABASE_SELECTS.layout)
          .eq("service_id", serviceId)
          .eq("is_active", true)
          .maybeSingle() as QueryResult<LayoutRow>,
        "Failed to load resource layout",
      );

      return adaptResourceLayout(data);
    },

    async getConfirmedReservations(lookup) {
      const data = assertNoSupabaseError(
        await fromTable(client, RESERVATION_SUPABASE_TABLES.bookings)
          .select(RESERVATION_SUPABASE_SELECTS.booking)
          .eq("service_id", lookup.serviceId)
          .eq("booking_date", lookup.bookingDate)
          .eq("status", "confirmed") as QueryResult<LegacyBookingShape[]>,
        "Failed to load confirmed reservations",
      );

      return adaptBookingRows(data ?? []);
    },

    async getMaintenanceResourceLabels(serviceId) {
      const data = assertNoSupabaseError(
        await fromTable(client, RESERVATION_SUPABASE_TABLES.serviceSeatMaintenance)
          .select(RESERVATION_SUPABASE_SELECTS.maintenance)
          .eq("service_id", serviceId)
          .eq("is_active", true) as QueryResult<MaintenanceRow[]>,
        "Failed to load maintenance labels",
      );

      return adaptMaintenanceRows(data ?? []);
    },

    createReservation,

    createReservationAtomic,

    async createReservationAtomically(input) {
      const result = await createReservationAtomic(input);

      if (!result.ok) {
        throw new SupabaseAtomicReservationError(result);
      }

      return result.reservation;
    },

    async createReservationWithValidation(input) {
      const validation = validateReservationRequest(
        input.service,
        input.existingReservations,
        input.reservation,
        input.maintenanceResourceLabels ?? [],
      );

      if (!validation.ok) {
        return {
          reservation: input.reservation,
          validation,
          atomic: false,
        };
      }

      return {
        reservation: await createReservation(input.reservation),
        validation,
        atomic: false,
      };
    },
  };
}
