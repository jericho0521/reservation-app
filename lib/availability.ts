import type { TimeSlot } from '@/types';
import { normalizeSeatLabels } from './seat-maintenance';

export interface AvailabilityBooking {
    start_time: string;
    seats_booked: number;
    seat_labels?: string[] | null;
}

export const OPERATING_HOURS = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0] as const;

export function getEndTime(startTime: string): string {
    const startHour = Number.parseInt(startTime.split(':')[0], 10);
    const endHour = (startHour + 1) % 24;
    return `${endHour.toString().padStart(2, '0')}:00`;
}

function normalizeSlotTime(time: string): string {
    return time.slice(0, 5);
}

function getFallbackSeatLabel(seatNumber: number): string {
    return `RS${seatNumber}`;
}

function getTakenSeatLabels(totalSeats: number, bookings: AvailabilityBooking[]): string[] {
    const labels = new Set<string>();
    let missingLabelCount = 0;

    for (const booking of bookings) {
        const explicitLabels = Array.isArray(booking.seat_labels)
            ? booking.seat_labels.filter((label): label is string => typeof label === 'string' && label.length > 0)
            : [];

        explicitLabels.forEach(label => labels.add(label));
        missingLabelCount += Math.max(0, booking.seats_booked - explicitLabels.length);
    }

    for (let seatNumber = totalSeats; seatNumber >= 1 && missingLabelCount > 0; seatNumber -= 1) {
        const fallbackLabel = getFallbackSeatLabel(seatNumber);

        if (!labels.has(fallbackLabel)) {
            labels.add(fallbackLabel);
            missingLabelCount -= 1;
        }
    }

    return Array.from(labels).sort((a, b) => {
        const left = Number.parseInt(a.replace(/\D/g, ''), 10);
        const right = Number.parseInt(b.replace(/\D/g, ''), 10);

        if (Number.isNaN(left) || Number.isNaN(right)) {
            return a.localeCompare(b);
        }

        return left - right;
    });
}

export function generateTimeSlots(
    totalSeats: number,
    bookings: AvailabilityBooking[],
    maintenanceSeatLabels: string[] = [],
): TimeSlot[] {
    const bookingsBySlot = new Map<string, AvailabilityBooking[]>();
    const normalizedMaintenanceSeatLabels = normalizeSeatLabels(maintenanceSeatLabels);

    for (const booking of bookings) {
        const startTime = normalizeSlotTime(booking.start_time);
        const slotBookings = bookingsBySlot.get(startTime) ?? [];
        slotBookings.push(booking);
        bookingsBySlot.set(startTime, slotBookings);
    }

    return OPERATING_HOURS.map(hour => {
        const startTime = `${hour.toString().padStart(2, '0')}:00`;
        const slotBookings = bookingsBySlot.get(startTime) ?? [];
        const bookedSeats = slotBookings.reduce((sum, booking) => sum + booking.seats_booked, 0);
        const availableSeats = Math.max(0, totalSeats - bookedSeats - normalizedMaintenanceSeatLabels.length);
        const takenSeatLabels = normalizeSeatLabels([
            ...normalizedMaintenanceSeatLabels,
            ...getTakenSeatLabels(totalSeats, slotBookings),
        ]);

        return {
            start_time: startTime,
            end_time: getEndTime(startTime),
            available_seats: availableSeats,
            is_available: availableSeats > 0,
            taken_seat_labels: takenSeatLabels,
            ...(normalizedMaintenanceSeatLabels.length > 0
                ? { maintenance_seat_labels: normalizedMaintenanceSeatLabels }
                : {}),
        };
    });
}
