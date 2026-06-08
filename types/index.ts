import type {
    ReservationPolicy,
    ReservableResource,
    ResourceKind,
    ResourceLayout,
    ResourceSelectionMode,
} from "@project-play/reservations-core";

export interface Service {
    id: string;
    name: string;
    description?: string;
    total_seats: number;
    created_at: string;
    resource_kind?: ResourceKind;
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
    start_time: string;
    end_time: string;
    available_seats: number;
    is_available: boolean;
    taken_seat_labels: string[];
    maintenance_seat_labels?: string[];
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

export type {
    AssignedResourceReservationPolicy,
    AvailabilityWindow,
    CapacityReservationPolicy,
    CustomResourceLayout,
    CustomResourceLayoutPosition,
    GridResourceLayout,
    HybridReservationPolicy,
    LegacyBookingShape,
    LegacyServiceShape,
    LegacyTimeSlotShape,
    NoResourceLayout,
    ReservableResource,
    Reservation,
    ReservationItem,
    ReservationPolicy,
    ReservationPolicyKind,
    ReservationService,
    ReservationTimeSlot,
    ResourceKind,
    ResourceLayout,
    ResourceLayoutKind,
    ResourceSelectionMode,
} from "@project-play/reservations-core";
