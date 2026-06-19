import type {
  AvailabilityResponse,
  AvailabilitySlot,
  CreateReservationInput,
  JsonValue,
  ListReservationsResponse,
  ReservationListSummary,
  ListResourceMaintenanceResponse,
  ListResourcesResponse,
  ListServicesResponse,
  ListVenuesResponse,
  ReservationItemInput,
  ReservationResponse,
  RescheduleReservationInput,
  ResourceLayoutResponse,
  ResourceMaintenanceResponse,
  ResourceResponse,
  ServiceResponse,
  UpdateReservationPatch,
  VenueResponse,
} from "@reservation-platform/contract-types";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" ? value as UnknownRecord : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function booleanValue(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function isMetadataValue(value: unknown): value is string | number | boolean | null {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}

function metadataFrom(row: UnknownRecord) {
  const metadata = asRecord(row.metadata);
  const entries = Object.entries(metadata)
    .filter((entry): entry is [string, string | number | boolean | null] => isMetadataValue(entry[1]));
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function mergeMetadata(...records: Array<Record<string, string | number | boolean | null> | undefined>) {
  const merged = Object.assign({}, ...records.filter(Boolean));
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function primitiveObjectFrom(record: UnknownRecord, keys: string[]) {
  const entries = keys
    .map((key) => [key, record[key]] as const)
    .filter((entry): entry is [string, string | number | boolean | null] => isMetadataValue(entry[1]));
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  if (value && typeof value === "object") {
    return Object.values(value as UnknownRecord).every(isJsonValue);
  }
  return false;
}

function jsonValueFrom(value: unknown): JsonValue | undefined {
  return isJsonValue(value) ? value : undefined;
}

function legacyServiceNameFrom(row: UnknownRecord) {
  const services = row.services;
  if (Array.isArray(services)) {
    return stringValue(asRecord(services[0]).name);
  }
  return stringValue(asRecord(services).name);
}

function resourceKindFrom(value: unknown): ResourceResponse["kind"] {
  const kind = stringValue(value);
  return kind === "seat" ||
    kind === "station" ||
    kind === "room" ||
    kind === "court" ||
    kind === "screening" ||
    kind === "capacity_bucket" ||
    kind === "custom"
    ? kind
    : "custom";
}

function optionalResourceKindFrom(value: unknown): ResourceResponse["kind"] | undefined {
  return stringValue(value) ? resourceKindFrom(value) : undefined;
}

function resourceStrategyFrom(value: unknown): ServiceResponse["resource_strategy"] {
  const selectionMode = stringValue(value);
  return selectionMode === "assigned_resource" || selectionMode === "hybrid"
    ? selectionMode
    : "quantity";
}

function layoutKindFrom(value: unknown): ResourceLayoutResponse["kind"] {
  const kind = stringValue(value);
  return kind === "none" || kind === "grid" || kind === "custom" ? kind : "custom";
}

function reservationItemsFrom(row: UnknownRecord): ReservationItemInput[] | undefined {
  const nativeItems = Array.isArray(row.reservation_items) ? row.reservation_items : undefined;
  if (nativeItems) {
    return nativeItems
      .map((item) => {
        const record = asRecord(item);
        return {
          resource_id: stringValue(record.resource_id),
          resource_label: stringValue(record.resource_label),
          quantity: numberValue(record.quantity) ?? 1,
        };
      })
      .filter((item) => item.resource_id || item.resource_label || item.quantity > 0);
  }

  const labels = Array.isArray(row.seat_labels) ? row.seat_labels.filter((label): label is string => typeof label === "string") : [];
  return labels.length > 0 ? labels.map((resource_label) => ({ resource_label, quantity: 1 })) : undefined;
}

function resourceLabelsFromInput(input: {
  reservation_items?: ReservationItemInput[];
  resource_ids?: string[];
}) {
  const itemLabels = input.reservation_items
    ?.map((item) => item.resource_label ?? item.resource_id)
    .filter((label): label is string => typeof label === "string" && label.length > 0);

  if (itemLabels && itemLabels.length > 0) {
    return itemLabels;
  }

  return input.resource_ids?.filter((label): label is string => typeof label === "string" && label.length > 0);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function legacyReservationItemsFromInput(input: CreateReservationInput | RescheduleReservationInput) {
  return input.reservation_items?.map((item) => {
    if (item.resource_label || !item.resource_id || isUuid(item.resource_id)) {
      return item;
    }

    return {
      resource_label: item.resource_id,
      quantity: item.quantity,
    };
  });
}

export function toPlatformVenue(row: unknown): VenueResponse {
  const record = asRecord(row);
  return {
    venue_id: stringValue(record.id) ?? stringValue(record.venue_id) ?? "",
    tenant_id: stringValue(record.tenant_id),
    name: stringValue(record.name) ?? "Untitled venue",
    timezone: stringValue(record.timezone),
    metadata: metadataFrom(record),
  };
}

export function toPlatformVenuesResponse(rows: unknown[] | null | undefined): ListVenuesResponse {
  return { venues: (rows ?? []).map(toPlatformVenue) };
}

export function toPlatformService(row: unknown): ServiceResponse {
  const record = asRecord(row);
  const resources = Array.isArray(record.resources)
    ? record.resources.map(toPlatformResource)
    : undefined;
  const layoutInput = Array.isArray(record.layout)
    ? record.layout[0]
    : Array.isArray(record.resource_layout)
      ? record.resource_layout[0]
      : record.layout ?? record.resource_layout;
  const layout = layoutInput
    ? toPlatformResourceLayout(layoutInput, stringValue(record.id) ?? "service-layout")
    : undefined;

  return {
    service_id: stringValue(record.id) ?? stringValue(record.service_id) ?? "",
    venue_id: stringValue(record.venue_id),
    name: stringValue(record.name) ?? "Untitled service",
    description: stringValue(record.description),
    duration_minutes: numberValue(record.duration_minutes),
    total_quantity: numberValue(record.total_quantity) ?? numberValue(record.total_seats),
    resource_kind: optionalResourceKindFrom(record.resource_kind),
    resource_strategy: resourceStrategyFrom(record.selection_mode ?? record.resource_strategy),
    reservation_policy: jsonValueFrom(record.reservation_policy),
    resources,
    layout,
    metadata: metadataFrom(record),
  };
}

export function toPlatformServicesResponse(rows: unknown[] | null | undefined): ListServicesResponse {
  return { services: (rows ?? []).map(toPlatformService) };
}

export function toPlatformResource(row: unknown): ResourceResponse {
  const record = asRecord(row);
  return {
    resource_id: stringValue(record.id) ?? stringValue(record.resource_id) ?? "",
    service_id: stringValue(record.service_id),
    label: stringValue(record.label) ?? "",
    kind: resourceKindFrom(record.kind),
    is_active: booleanValue(record.is_active, true),
    capacity: numberValue(record.capacity),
    metadata: metadataFrom(record),
  };
}

export function toPlatformResourcesResponse(rows: unknown[] | null | undefined): ListResourcesResponse {
  return { resources: (rows ?? []).map(toPlatformResource) };
}

export function toPlatformResourceLayout(row: unknown, layoutId: string): ResourceLayoutResponse {
  const record = asRecord(row);
  const metadata = asRecord(record.metadata);
  const layoutResources = Array.isArray(metadata.resources)
    ? metadata.resources
    : Array.isArray(record.positions)
      ? record.positions
      : Array.isArray(record.resources)
        ? record.resources
        : undefined;
  const resources = layoutResources
    ? layoutResources.map((item) => {
      const resource = asRecord(item);
      return {
        resource_id: stringValue(resource.resource_id) ?? stringValue(resource.id) ?? "",
        label: stringValue(resource.label),
        row: numberValue(resource.row),
        column: numberValue(resource.column),
        x: numberValue(resource.x),
        y: numberValue(resource.y),
        width: numberValue(resource.width),
        height: numberValue(resource.height),
        metadata: metadataFrom(resource),
      };
    })
    : undefined;
  const layoutMetadata = mergeMetadata(
    metadataFrom(record),
    primitiveObjectFrom(record, ["columns", "rows", "group_label"]),
  );

  return {
    layout_id: stringValue(record.id) ?? stringValue(record.layout_id) ?? layoutId,
    service_id: stringValue(record.service_id),
    kind: layoutKindFrom(record.layout_kind ?? record.kind),
    resources,
    metadata: layoutMetadata,
  };
}

export function toPlatformAvailabilityResponse(legacy: unknown): AvailabilityResponse {
  const record = asRecord(legacy);
  const slots = Array.isArray(record.timeSlots) ? record.timeSlots : [];
  return {
    total_quantity: numberValue(record.total_quantity) ?? numberValue(record.totalSeats),
    resource_kind: optionalResourceKindFrom(record.resource_kind),
    resource_strategy: resourceStrategyFrom(record.selection_mode ?? record.resource_strategy),
    reservation_policy: jsonValueFrom(record.reservation_policy),
    resources: Array.isArray(record.resources) ? record.resources.map(toPlatformResource) : undefined,
    layout: record.layout ? toPlatformResourceLayout(record.layout, stringValue(record.service_id) ?? "availability-layout") : undefined,
    slots: slots.map((slot): AvailabilitySlot => {
      const item = asRecord(slot);
      const availableQuantity = numberValue(item.available_quantity)
        ?? numberValue(item.availableSeats)
        ?? numberValue(item.available_seats)
        ?? 0;
      return {
        start_at: stringValue(item.start_at),
        end_at: stringValue(item.end_at),
        start_time: stringValue(item.start_time),
        end_time: stringValue(item.end_time),
        available_quantity: availableQuantity,
        is_available: typeof item.is_available === "boolean" ? item.is_available : availableQuantity > 0,
        resource_ids: Array.isArray(item.resource_ids) ? item.resource_ids.filter((id): id is string => typeof id === "string") : undefined,
        taken_resource_labels: Array.isArray(item.taken_resource_labels)
          ? item.taken_resource_labels.filter((label): label is string => typeof label === "string")
          : Array.isArray(item.taken_seat_labels)
            ? item.taken_seat_labels.filter((label): label is string => typeof label === "string")
            : undefined,
        maintenance_resource_labels: Array.isArray(item.maintenance_resource_labels)
          ? item.maintenance_resource_labels.filter((label): label is string => typeof label === "string")
          : Array.isArray(item.maintenance_seat_labels)
            ? item.maintenance_seat_labels.filter((label): label is string => typeof label === "string")
            : undefined,
      };
    }),
  };
}

export function toLegacyBookingCreateInput(input: CreateReservationInput) {
  const resourceLabels = resourceLabelsFromInput(input);
  const reservationItems = legacyReservationItemsFromInput(input);
  return {
    service_id: input.service_id,
    user_name: input.customer.name ?? input.customer.external_customer_id ?? input.customer.customer_id ?? "Guest",
    user_email: input.customer.email ?? "guest@example.invalid",
    user_phone: input.customer.phone ?? "unknown",
    booking_date: input.date ?? input.start_at?.slice(0, 10) ?? "",
    start_time: input.start_time ?? input.start_at?.slice(11, 16) ?? "",
    end_time: input.end_time ?? input.end_at?.slice(11, 16) ?? "",
    seats_booked: input.quantity,
    seat_labels: resourceLabels,
    reservation_items: reservationItems,
    interface_type: "form" as const,
  };
}

export function toLegacyBookingUpdatePatch(input: UpdateReservationPatch) {
  return {
    ...(input.customer?.name ? { user_name: input.customer.name } : {}),
    ...(input.customer?.email ? { user_email: input.customer.email } : {}),
    ...(input.status ? { status: input.status } : {}),
  };
}

export function toLegacyBookingRescheduleInput(input: RescheduleReservationInput) {
  const resourceLabels = resourceLabelsFromInput(input);
  return {
    ...(input.date ?? input.start_at?.slice(0, 10) ? { booking_date: input.date ?? input.start_at?.slice(0, 10) } : {}),
    ...(input.start_time ?? input.start_at?.slice(11, 16) ? { start_time: input.start_time ?? input.start_at?.slice(11, 16) } : {}),
    ...(input.end_time ?? input.end_at?.slice(11, 16) ? { end_time: input.end_time ?? input.end_at?.slice(11, 16) } : {}),
    ...(input.quantity ? { seats_booked: input.quantity } : {}),
    ...(resourceLabels
      ? { seat_labels: resourceLabels }
      : {}),
  };
}

export function hasMovementPatchFields(input: unknown) {
  const record = asRecord(input);
  return [
    "booking_date",
    "date",
    "start_at",
    "end_at",
    "start_time",
    "end_time",
    "quantity",
    "seats_booked",
    "resource_ids",
    "seat_labels",
    "reservation_items",
    "items",
  ].some((field) => field in record);
}

export function toPlatformReservation(row: unknown): ReservationResponse {
  const record = asRecord(row);
  return {
    reservation_id: stringValue(record.id) ?? stringValue(record.reservation_id) ?? "",
    status: stringValue(record.status) ?? "confirmed",
    tenant_id: stringValue(record.tenant_id),
    venue_id: stringValue(record.venue_id),
    service_id: stringValue(record.service_id) ?? "",
    date: stringValue(record.booking_date) ?? stringValue(record.date),
    start_time: stringValue(record.start_time),
    end_time: stringValue(record.end_time),
    quantity: numberValue(record.seats_booked) ?? numberValue(record.quantity) ?? 1,
    reservation_items: reservationItemsFrom(record),
    customer: {
      customer_id: stringValue(record.customer_id),
      external_customer_id: stringValue(record.external_customer_id),
      name: stringValue(record.user_name) ?? stringValue(record.customer_name),
      email: stringValue(record.user_email) ?? stringValue(record.customer_email),
      phone: stringValue(record.user_phone) ?? stringValue(record.customer_phone),
    },
    metadata: mergeMetadata(
      metadataFrom(record),
      legacyServiceNameFrom(record) ? { service_name: legacyServiceNameFrom(record) ?? null } : undefined,
    ),
    created_at: stringValue(record.created_at),
    updated_at: stringValue(record.updated_at),
  };
}

export function toPlatformReservationsResponse(
  rows: unknown[] | null | undefined,
  summary?: ReservationListSummary,
): ListReservationsResponse {
  return {
    reservations: (rows ?? []).map(toPlatformReservation),
    ...(summary ? { summary } : {}),
  };
}

export function toPlatformResourceMaintenance(row: unknown): ResourceMaintenanceResponse {
  const record = asRecord(row);
  return {
    maintenance_id: stringValue(record.id) ?? stringValue(record.maintenance_id) ?? "",
    resource_id: stringValue(record.resource_id),
    service_id: stringValue(record.service_id),
    starts_at: stringValue(record.starts_at),
    ends_at: stringValue(record.ends_at),
    reason: stringValue(record.reason),
    metadata: {
      ...(stringValue(record.seat_label) ? { resource_label: stringValue(record.seat_label) ?? null } : {}),
      ...(metadataFrom(record) ?? {}),
    },
  };
}

export function toPlatformResourceMaintenanceResponse(rows: unknown[] | null | undefined): ListResourceMaintenanceResponse {
  return { maintenance: (rows ?? []).map(toPlatformResourceMaintenance) };
}
