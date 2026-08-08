import type { TimeSlot } from '@/types';
import {
    getEndTime,
    isBookingSlotElapsed,
    OPERATING_HOURS,
} from './booking-schedule';
import {
    getBookingsForSlot,
    getUnavailableSeatLabels,
    type SlotSeatBooking,
} from './reservation-capacity';
import { normalizeSeatLabels } from './seat-maintenance';

export type AvailabilityBooking = SlotSeatBooking;

export function generateTimeSlots(
    totalSeats: number,
    bookings: AvailabilityBooking[],
    maintenanceSeatLabels: string[] = [],
): TimeSlot[] {
    const maintenanceLabels = normalizeSeatLabels(maintenanceSeatLabels);

    return OPERATING_HOURS.map(hour => {
        const startTime = `${hour.toString().padStart(2, '0')}:00`;
        const takenSeatLabels = normalizeSeatLabels(Array.from(getUnavailableSeatLabels(
            totalSeats,
            getBookingsForSlot(bookings, startTime),
            maintenanceLabels,
        )));
        const availableSeats = Math.max(0, totalSeats - takenSeatLabels.length);

        return {
            start_time: startTime,
            end_time: getEndTime(startTime),
            available_seats: availableSeats,
            is_available: availableSeats > 0,
            taken_seat_labels: takenSeatLabels,
            ...(maintenanceLabels.length > 0
                ? { maintenance_seat_labels: maintenanceLabels }
                : {}),
        };
    });
}

export function getBookableTimeSlots(
    totalSeats: number,
    bookings: AvailabilityBooking[],
    maintenanceSeatLabels: string[],
    bookingDate: string,
    now: Date = new Date(),
): TimeSlot[] {
    return generateTimeSlots(totalSeats, bookings, maintenanceSeatLabels)
        .filter(slot => !isBookingSlotElapsed(bookingDate, slot.start_time, now));
}
