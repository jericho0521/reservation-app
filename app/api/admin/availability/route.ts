import { NextResponse } from 'next/server';
import { z } from 'zod';
import { jsonError, requireAdminSupabase, supabaseErrorStatus } from '@/app/api/api-utils';
import { generateTimeSlots } from '@/lib/availability';
import { loadBookingAvailabilityResources } from '@/lib/booking-availability';
import { isBookingDateWithinWindow, isBookingSlotElapsed } from '@/lib/booking-schedule';

/**
 * Availability for staff recording walk-ins. Unlike the public endpoint this
 * keeps hours that have already started, because a walk-in customer is
 * usually booked into the current hour.
 */
export async function GET(request: Request) {
    const auth = await requireAdminSupabase();

    if (auth.response) {
        return auth.response;
    }

    const { searchParams } = new URL(request.url);
    const serviceId = searchParams.get('service_id');
    const date = searchParams.get('date');

    if (!serviceId || !date) {
        return jsonError('service_id and date are required', 400);
    }

    if (!z.string().uuid().safeParse(serviceId).success) {
        return jsonError('service_id must be a valid UUID', 400);
    }

    if (!isBookingDateWithinWindow(date)) {
        return jsonError('Date must be between today and 30 days from today', 400);
    }

    try {
        const { data: service, error: serviceError } = await auth.supabase
            .from('services')
            .select('total_seats')
            .eq('id', serviceId)
            .single();

        if (serviceError) {
            return jsonError(
                supabaseErrorStatus(serviceError) === 404 ? 'Service not found' : 'Failed to load service',
                supabaseErrorStatus(serviceError),
            );
        }

        const resources = await loadBookingAvailabilityResources(serviceId, date);
        const now = new Date();
        const timeSlots = generateTimeSlots(
            service.total_seats,
            resources.bookings,
            resources.maintenanceSeatLabels,
        ).map(slot => ({
            ...slot,
            has_started: isBookingSlotElapsed(date, slot.start_time, now),
        }));

        return NextResponse.json({ timeSlots, totalSeats: service.total_seats });
    } catch (error) {
        console.error('Failed to load admin availability:', error);
        return jsonError('Failed to check availability', 500);
    }
}
