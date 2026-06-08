import type { TimeSlot } from '@/types';
import {
    DEFAULT_OPERATING_HOURS,
    generateAvailabilityTimeSlots,
    getEndTime,
} from './reservations/availability';
import { adaptLegacyBooking, createAssignedResourcePolicy } from './reservations/types';
import { normalizeSeatLabels } from './seat-maintenance';

export interface AvailabilityBooking {
    start_time: string;
    seats_booked: number;
    seat_labels?: string[] | null;
}

export { getEndTime };

export const OPERATING_HOURS = DEFAULT_OPERATING_HOURS;

export function generateTimeSlots(
    totalSeats: number,
    bookings: AvailabilityBooking[],
    maintenanceSeatLabels: string[] = [],
): TimeSlot[] {
    const normalizedMaintenanceSeatLabels = normalizeSeatLabels(maintenanceSeatLabels);
    const legacyFallbackLabels = Array.from(
        { length: totalSeats },
        (_, index) => `RS${totalSeats - index}`,
    );
    const service = {
        total_seats: totalSeats,
        policy: createAssignedResourcePolicy(totalSeats),
        resources: Array.from({ length: totalSeats }, (_, index) => ({
            id: `legacy-rs-${index + 1}`,
            service_id: "legacy",
            label: `RS${index + 1}`,
            kind: "seat" as const,
            is_active: true,
            capacity: 1,
        })),
    };
    const reservations = bookings.map((booking, index) => adaptLegacyBooking({
        id: `legacy-booking-${index}`,
        service_id: "legacy",
        user_name: "",
        user_email: "",
        booking_date: "",
        start_time: booking.start_time,
        end_time: getEndTime(booking.start_time),
        seats_booked: booking.seats_booked,
        seat_labels: Array.isArray(booking.seat_labels)
            ? normalizeSeatLabels(booking.seat_labels)
            : [],
        interface_type: "form",
    }));

    return generateAvailabilityTimeSlots(service, reservations, {
        operatingHours: OPERATING_HOURS,
        maintenanceResourceLabels: normalizedMaintenanceSeatLabels,
        legacyFallbackLabels,
    }).map((slot) => {
        const takenSeatLabels = normalizeSeatLabels(slot.taken_seat_labels);

        return {
            start_time: slot.start_time,
            end_time: slot.end_time,
            available_seats: Math.max(0, totalSeats - takenSeatLabels.length),
            is_available: takenSeatLabels.length < totalSeats,
            taken_seat_labels: takenSeatLabels,
            ...(normalizedMaintenanceSeatLabels.length > 0
                ? { maintenance_seat_labels: normalizedMaintenanceSeatLabels }
                : {}),
        };
    });
}
