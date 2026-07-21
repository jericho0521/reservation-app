import {
  adaptLegacyBooking,
  adaptLegacyService,
  createAssignedResourcePolicy,
  createCapacityPolicy,
  createHybridPolicy,
  type LegacyBookingShape,
  type Reservation,
  type ReservationPolicy,
  type ReservationService,
  type ResourceKind,
  type ResourceLayout,
  type ResourceSelectionMode,
  type ReservableResource,
} from "@project-play/reservations-core";

export interface ServiceMetadataRow {
  id: string;
  venue_id?: string;
  name: string;
  description?: string | null;
  total_seats: number;
  created_at: string;
  resource_kind?: ResourceKind | null;
  selection_mode?: ResourceSelectionMode | null;
  reservation_policy?: unknown;
  metadata?: Record<string, unknown> | null;
  duration_minutes?: number | null;
  buffer_before_minutes?: number | null;
  buffer_after_minutes?: number | null;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function parseReservationPolicy(
  rawPolicy: unknown,
  selectionMode: ResourceSelectionMode,
  totalSeats: number,
): ReservationPolicy {
  if (isRecord(rawPolicy)) {
    const maxQuantity = getNumber(rawPolicy.max_quantity) ?? totalSeats;
    const requireResourceLabels = typeof rawPolicy.require_resource_labels === "boolean"
      ? rawPolicy.require_resource_labels
      : selectionMode === "assigned_resource";
    if (selectionMode === "assigned_resource") return createAssignedResourcePolicy(maxQuantity);
    if (selectionMode === "hybrid") return createHybridPolicy(maxQuantity, requireResourceLabels);
    return createCapacityPolicy(maxQuantity);
  }
  if (selectionMode === "assigned_resource") return createAssignedResourcePolicy(totalSeats);
  if (selectionMode === "hybrid") return createHybridPolicy(totalSeats);
  return createCapacityPolicy(totalSeats);
}

export function adaptResourceLayout(layout: LayoutRow | null): ResourceLayout {
  if (!layout) return { kind: "none" };
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
      ? metadata.positions.filter(isRecord).map((position) => ({
        resource_id: getString(position.resource_id) ?? "",
        x: getNumber(position.x) ?? 0,
        y: getNumber(position.y) ?? 0,
        group_label: getString(position.group_label) ?? undefined,
      })).filter((position) => position.resource_id.length > 0)
      : [];
    return { kind: "custom", positions };
  }
  return { kind: "none" };
}

export function adaptReservableResources(resources: ResourceRow[] = [], fallbackKind: ResourceKind = "capacity_bucket") {
  return resources.map((resource): ReservableResource | null => {
    const label = getString(resource.label) ?? getString(resource.resource_label);
    if (!label) return null;
    return {
      id: resource.id,
      service_id: resource.service_id,
      label,
      kind: resource.kind ?? resource.resource_kind ?? fallbackKind,
      is_active: resource.is_active ?? resource.status !== "inactive",
      capacity: resource.capacity ?? 1,
      metadata: resource.metadata ?? undefined,
    };
  }).filter((resource): resource is ReservableResource => resource !== null);
}

export function adaptServiceMetadata(
  service: ServiceMetadataRow,
  resources: ResourceRow[] = [],
  layout: LayoutRow | null = null,
  availabilityRules: AvailabilityRuleRow[] = [],
): ReservationService {
  const selectionMode = service.selection_mode ?? "quantity";
  const resourceKind = service.resource_kind ?? (selectionMode === "assigned_resource" ? "seat" : "capacity_bucket");
  const policy = parseReservationPolicy(service.reservation_policy, selectionMode, service.total_seats);
  return {
    ...adaptLegacyService({
      id: service.id,
      name: service.name,
      description: service.description ?? undefined,
      total_seats: service.total_seats,
      created_at: service.created_at,
    }, {
      resource_kind: resourceKind,
      selection_mode: selectionMode,
      policy,
      layout: adaptResourceLayout(layout),
    }),
    resources: adaptReservableResources(resources, resourceKind),
    availability_windows: availabilityRules.filter((rule) => rule.is_active !== false).map((rule) => ({
      day_of_week: rule.day_of_week ?? undefined,
      start_time: rule.start_time,
      end_time: rule.end_time,
      interval_minutes: rule.interval_minutes ?? 60,
    })),
    ...(getNumber(service.duration_minutes) ? { duration_minutes: getNumber(service.duration_minutes)! } : {}),
    buffer_before_minutes: getNumber(service.buffer_before_minutes) ?? 0,
    buffer_after_minutes: getNumber(service.buffer_after_minutes) ?? 0,
  };
}

export function adaptBookingRows(bookings: LegacyBookingShape[]): Reservation[] {
  return bookings.map((booking) => adaptLegacyBooking(booking));
}

export function adaptMaintenanceRows(rows: MaintenanceRow[] = []) {
  return rows.map((row) => row.seat_label ?? row.resource_label)
    .filter((label): label is string => typeof label === "string");
}

export function getLegacyFallbackLabels(service: ReservationService) {
  return service.resources && service.resources.length > 0
    ? service.resources.map((resource) => resource.label).reverse()
    : Array.from({ length: service.total_seats }, (_, index) => `RS${service.total_seats - index}`);
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
