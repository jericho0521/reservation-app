export type ResourceKind =
  | "seat"
  | "station"
  | "room"
  | "court"
  | "screening"
  | "capacity_bucket"
  | "custom";

export type ResourceSelectionMode =
  | "quantity"
  | "assigned_resource"
  | "hybrid";

export type ReservationPolicyKind =
  | "capacity"
  | "assigned_resource"
  | "hybrid";

export interface CapacityReservationPolicy {
  kind: "capacity";
  selection_mode: "quantity";
  max_quantity: number;
  require_resource_labels: false;
  allow_partial_capacity: boolean;
}

export interface AssignedResourceReservationPolicy {
  kind: "assigned_resource";
  selection_mode: "assigned_resource";
  max_quantity: number;
  require_resource_labels: true;
  allow_partial_capacity: false;
}

export interface HybridReservationPolicy {
  kind: "hybrid";
  selection_mode: "hybrid";
  max_quantity: number;
  require_resource_labels: boolean;
  allow_partial_capacity: boolean;
}

export type ReservationPolicy =
  | CapacityReservationPolicy
  | AssignedResourceReservationPolicy
  | HybridReservationPolicy;

export type ResourceLayoutKind = "none" | "grid" | "custom";

export interface NoResourceLayout {
  kind: "none";
}

export interface GridResourceLayout {
  kind: "grid";
  columns: number;
  rows?: number;
  group_label?: string;
}

export interface CustomResourceLayoutPosition {
  resource_id: string;
  x: number;
  y: number;
  group_label?: string;
}

export interface CustomResourceLayout {
  kind: "custom";
  positions: CustomResourceLayoutPosition[];
}

export type ResourceLayout =
  | NoResourceLayout
  | GridResourceLayout
  | CustomResourceLayout;

export interface ReservableResource {
  id: string;
  service_id: string;
  label: string;
  kind: ResourceKind;
  is_active: boolean;
  capacity?: number;
  metadata?: Record<string, unknown>;
}

// Internal domain metadata for future availability generation.
export interface AvailabilityWindow {
  day_of_week?: number;
  start_time: string;
  end_time: string;
  interval_minutes: number;
}

// Stable public API shape used only as adapter input during migration.
export interface LegacyServiceShape {
  id: string;
  name: string;
  description?: string;
  total_seats: number;
  created_at: string;
}

// Stable public API shape used only as adapter input during migration.
export interface LegacyBookingShape {
  id?: string;
  service_id: string;
  user_name: string;
  user_email: string;
  user_phone?: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  seats_booked: number;
  seat_labels?: string[];
  status?: string;
  interface_type: "form" | "chat";
  staff_id?: string;
  buffer_before_minutes?: number;
  buffer_after_minutes?: number;
}

// Stable public API shape used only as adapter input during migration.
export interface LegacyTimeSlotShape {
  start_time: string;
  end_time: string;
  available_seats: number;
  is_available: boolean;
  taken_seat_labels: string[];
  maintenance_seat_labels?: string[];
}

// New internal domain contract. Legacy fields stay until API consumers migrate.
export interface ReservationService {
  id: string;
  name: string;
  description?: string;
  resource_kind: ResourceKind;
  selection_mode: ResourceSelectionMode;
  policy: ReservationPolicy;
  layout: ResourceLayout;
  resources?: ReservableResource[];
  availability_windows?: AvailabilityWindow[];
  duration_minutes?: number;
  buffer_before_minutes?: number;
  buffer_after_minutes?: number;
  created_at?: string;

  // Stable migration compatibility field from the current public API.
  total_seats: number;
}

// New internal domain contract for resource or quantity allocations.
export interface ReservationItem {
  resource_id?: string;
  resource_label?: string;
  quantity: number;
}

// New internal domain contract. Legacy fields stay until API consumers migrate.
export interface Reservation {
  id?: string;
  service_id: string;
  customer_name: string;
  customer_email: string;
  customer_phone?: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  quantity: number;
  items: ReservationItem[];
  status?: string;
  interface_type: LegacyBookingShape["interface_type"];
  channel?: "web_booking" | "web_chat" | "whatsapp" | "staff" | "simulation";
  staff_id?: string;
  buffer_before_minutes?: number;
  buffer_after_minutes?: number;

  // Stable migration compatibility fields from the current public API.
  seats_booked: number;
  seat_labels: string[];
}

// New internal domain contract. Legacy fields stay until API consumers migrate.
export interface ReservationTimeSlot {
  start_time: string;
  end_time: string;
  available_quantity: number;
  is_available: boolean;
  taken_resource_labels: string[];
  maintenance_resource_labels: string[];
  staff_id?: string;

  // Stable migration compatibility fields from the current public API.
  available_seats: number;
  taken_seat_labels: string[];
  maintenance_seat_labels?: string[];
}

export function createCapacityPolicy(
  maxQuantity: number,
): CapacityReservationPolicy {
  return {
    kind: "capacity",
    selection_mode: "quantity",
    max_quantity: maxQuantity,
    require_resource_labels: false,
    allow_partial_capacity: true,
  };
}

export function createAssignedResourcePolicy(
  maxQuantity: number,
): AssignedResourceReservationPolicy {
  return {
    kind: "assigned_resource",
    selection_mode: "assigned_resource",
    max_quantity: maxQuantity,
    require_resource_labels: true,
    allow_partial_capacity: false,
  };
}

export function createHybridPolicy(
  maxQuantity: number,
  requireResourceLabels = false,
): HybridReservationPolicy {
  return {
    kind: "hybrid",
    selection_mode: "hybrid",
    max_quantity: maxQuantity,
    require_resource_labels: requireResourceLabels,
    allow_partial_capacity: true,
  };
}

export function adaptLegacyService(
  service: LegacyServiceShape,
  options: {
    resource_kind?: ResourceKind;
    selection_mode?: ResourceSelectionMode;
    layout?: ResourceLayout;
    policy?: ReservationPolicy;
  } = {},
): ReservationService {
  const selectionMode = options.selection_mode ?? "quantity";
  const policy =
    options.policy ??
    (selectionMode === "assigned_resource"
      ? createAssignedResourcePolicy(service.total_seats)
      : selectionMode === "hybrid"
        ? createHybridPolicy(service.total_seats)
        : createCapacityPolicy(service.total_seats));

  return {
    id: service.id,
    name: service.name,
    description: service.description,
    resource_kind: options.resource_kind ?? "capacity_bucket",
    selection_mode: selectionMode,
    policy,
    layout: options.layout ?? { kind: "none" },
    created_at: service.created_at,
    total_seats: service.total_seats,
  };
}

export function adaptLegacyBooking(booking: LegacyBookingShape): Reservation {
  const seatLabels = booking.seat_labels ?? [];

  return {
    id: booking.id,
    service_id: booking.service_id,
    customer_name: booking.user_name,
    customer_email: booking.user_email,
    customer_phone: booking.user_phone,
    booking_date: booking.booking_date,
    start_time: booking.start_time,
    end_time: booking.end_time,
    quantity: booking.seats_booked,
    items:
      seatLabels.length > 0
        ? seatLabels.map((label) => ({
            resource_label: label,
            quantity: 1,
          }))
        : [{ quantity: booking.seats_booked }],
    status: booking.status,
    interface_type: booking.interface_type,
    ...(booking.staff_id ? { staff_id: booking.staff_id } : {}),
    ...(booking.buffer_before_minutes !== undefined ? { buffer_before_minutes: booking.buffer_before_minutes } : {}),
    ...(booking.buffer_after_minutes !== undefined ? { buffer_after_minutes: booking.buffer_after_minutes } : {}),
    seats_booked: booking.seats_booked,
    seat_labels: seatLabels,
  };
}

export function adaptLegacyTimeSlot(
  slot: LegacyTimeSlotShape,
): ReservationTimeSlot {
  const maintenanceLabels = slot.maintenance_seat_labels ?? [];

  return {
    start_time: slot.start_time,
    end_time: slot.end_time,
    available_quantity: slot.available_seats,
    is_available: slot.is_available,
    taken_resource_labels: slot.taken_seat_labels,
    maintenance_resource_labels: maintenanceLabels,
    available_seats: slot.available_seats,
    taken_seat_labels: slot.taken_seat_labels,
    maintenance_seat_labels: slot.maintenance_seat_labels,
  };
}
