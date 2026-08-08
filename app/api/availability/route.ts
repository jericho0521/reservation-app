import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { loadBookableTimeSlots } from '@/lib/booking-availability';
import { isBookingDateWithinWindow } from '@/lib/booking-schedule';
import { jsonError, supabaseErrorStatus } from '@/app/api/api-utils';
import { z } from 'zod';

export async function GET(request: Request) {
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
        // Get service to know total seats
        const { data: service, error: serviceError } = await supabase()
            .from('services')
            .select('total_seats')
            .eq('id', serviceId)
            .single();

        if (serviceError) {
            return jsonError(
                supabaseErrorStatus(serviceError) === 404 ? 'Service not found' : 'Failed to load service',
                supabaseErrorStatus(serviceError)
            );
        }

        const totalSeats = service.total_seats;
        const { timeSlots } = await loadBookableTimeSlots(serviceId, totalSeats, date);

        return NextResponse.json({ timeSlots, totalSeats });
    } catch (error) {
        console.error('Failed to check availability:', error);
        return jsonError('Failed to check availability', 500);
    }
}
