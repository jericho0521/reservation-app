import { getBookableTimeSlots } from './availability';
import { supabaseAdmin } from './supabase-admin';
import type { SlotSeatBooking } from './reservation-capacity';

export interface BookingAvailabilityResources {
    bookings: SlotSeatBooking[];
    maintenanceSeatLabels: string[];
}

export async function loadBookingAvailabilityResources(
    serviceId: string,
    bookingDate: string,
): Promise<BookingAvailabilityResources> {
    const bookingClient = supabaseAdmin();
    const [bookingsResult, maintenanceResult] = await Promise.all([
        bookingClient
            .from('bookings')
            .select('start_time, end_time, seats_booked, seat_labels')
            .eq('service_id', serviceId)
            .eq('booking_date', bookingDate)
            .eq('status', 'confirmed'),
        bookingClient
            .from('service_seat_maintenance')
            .select('seat_label')
            .eq('service_id', serviceId)
            .eq('is_active', true),
    ]);

    if (bookingsResult.error) {
        throw bookingsResult.error;
    }
    if (maintenanceResult.error) {
        throw maintenanceResult.error;
    }

    return {
        bookings: bookingsResult.data || [],
        maintenanceSeatLabels: (maintenanceResult.data || [])
            .map(seat => seat.seat_label)
            .filter((label): label is string => typeof label === 'string'),
    };
}

export async function loadBookableTimeSlots(
    serviceId: string,
    totalSeats: number,
    bookingDate: string,
) {
    const resources = await loadBookingAvailabilityResources(serviceId, bookingDate);

    return {
        ...resources,
        timeSlots: getBookableTimeSlots(
            totalSeats,
            resources.bookings,
            resources.maintenanceSeatLabels,
            bookingDate,
        ),
    };
}
