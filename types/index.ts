import type {
    AvailabilitySlot,
    JsonValue,
    ResourceKind as PlatformResourceKind,
    ResourceResponse,
    ServiceResponse,
} from "@reservation-platform/contract-types";

export type ResourceKind = PlatformResourceKind;
export type ResourceSelectionMode = NonNullable<ServiceResponse["resource_strategy"]>;

export type ReservationPolicyKind =
    | "capacity"
    | "assigned_resource"
    | "hybrid";

export interface ReservationPolicy {
    kind?: ReservationPolicyKind;
    selection_mode?: ResourceSelectionMode;
    max_quantity?: number;
    require_resource_labels?: boolean;
    allow_partial_capacity?: boolean;
    [key: string]: JsonValue | undefined;
}

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
    id: ResourceResponse["resource_id"];
    service_id: NonNullable<ResourceResponse["service_id"]>;
    label: ResourceResponse["label"];
    kind: ResourceResponse["kind"];
    is_active: ResourceResponse["is_active"];
    capacity?: ResourceResponse["capacity"];
    metadata?: ResourceResponse["metadata"];
}

export interface Service {
    id: ServiceResponse["service_id"];
    name: ServiceResponse["name"];
    description?: ServiceResponse["description"];
    total_seats: NonNullable<ServiceResponse["total_quantity"]>;
    created_at: string;
    resource_kind?: ServiceResponse["resource_kind"];
    selection_mode?: ResourceSelectionMode;
    reservation_policy?: ReservationPolicy;
    resources?: ReservableResource[];
    layout?: ResourceLayout;
}

export interface Booking {
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
    interface_type: 'form' | 'chat';
}

export interface TimeSlot {
    start_time: NonNullable<AvailabilitySlot["start_time"]>;
    end_time: NonNullable<AvailabilitySlot["end_time"]>;
    available_seats: AvailabilitySlot["available_quantity"];
    is_available: AvailabilitySlot["is_available"];
    taken_seat_labels: NonNullable<AvailabilitySlot["taken_resource_labels"]>;
    maintenance_seat_labels?: AvailabilitySlot["maintenance_resource_labels"];
}

export interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

export interface AvailabilityResponse {
    timeSlots?: TimeSlot[];
    totalSeats?: number;
    resource_kind?: ResourceKind;
    selection_mode?: ResourceSelectionMode;
    reservation_policy?: ReservationPolicy;
    resources?: ReservableResource[];
    layout?: ResourceLayout;
}

export interface AvailabilityWindow {
    day_of_week?: number;
    start_time: string;
    end_time: string;
    interval_minutes: number;
}

export type LegacyServiceShape = Pick<
    Service,
    "id" | "name" | "description" | "total_seats" | "created_at"
>;
export type LegacyBookingShape = Booking;
export type LegacyTimeSlotShape = TimeSlot;

export interface ReservationService extends LegacyServiceShape {
    resource_kind: ResourceKind;
    selection_mode: ResourceSelectionMode;
    policy: ReservationPolicy;
    layout: ResourceLayout;
    resources?: ReservableResource[];
    availability_windows?: AvailabilityWindow[];
}

export interface ReservationItem {
    resource_id?: string;
    resource_label?: string;
    quantity: number;
}

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
    interface_type: Booking["interface_type"];
    seats_booked: number;
    seat_labels: string[];
}

export interface ReservationTimeSlot {
    start_time: NonNullable<AvailabilitySlot["start_time"]>;
    end_time: NonNullable<AvailabilitySlot["end_time"]>;
    available_quantity: AvailabilitySlot["available_quantity"];
    is_available: AvailabilitySlot["is_available"];
    taken_resource_labels: NonNullable<AvailabilitySlot["taken_resource_labels"]>;
    maintenance_resource_labels: NonNullable<AvailabilitySlot["maintenance_resource_labels"]>;
    available_seats: AvailabilitySlot["available_quantity"];
    taken_seat_labels: NonNullable<AvailabilitySlot["taken_resource_labels"]>;
    maintenance_seat_labels?: AvailabilitySlot["maintenance_resource_labels"];
}
