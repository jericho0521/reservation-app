import type { TimeSlot } from '@/types';

export interface AvailabilityBooking {
    start_time: string;
    seats_booked: number;
}

export const OPERATING_HOURS = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0] as const;

export function getEndTime(startTime: string): string {
    const startHour = Number.parseInt(startTime.split(':')[0], 10);
    const endHour = (startHour + 1) % 24;
    return `${endHour.toString().padStart(2, '0')}:00`;
}

export function generateTimeSlots(
    totalSeats: number,
    bookings: AvailabilityBooking[],
): TimeSlot[] {
    const bookedSeatsBySlot = new Map<string, number>();

    for (const booking of bookings) {
        const startTime = booking.start_time.slice(0, 5);
        bookedSeatsBySlot.set(
            startTime,
            (bookedSeatsBySlot.get(startTime) ?? 0) + booking.seats_booked,
        );
    }

    return OPERATING_HOURS.map(hour => {
        const startTime = `${hour.toString().padStart(2, '0')}:00`;
        const availableSeats = Math.max(0, totalSeats - (bookedSeatsBySlot.get(startTime) ?? 0));

        return {
            start_time: startTime,
            end_time: getEndTime(startTime),
            available_seats: availableSeats,
            is_available: availableSeats > 0,
        };
    });
}
