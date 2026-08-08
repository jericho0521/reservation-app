import { NextResponse, NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';
import {
    BookingCreationError,
    createConfirmedBooking,
    validateBookingSchedule,
} from '@/lib/create-booking';
import { jsonError, requireAuthenticatedSupabase, supabaseErrorStatus } from '@/app/api/api-utils';
import { formBookingRequestSchema } from '@/lib/booking-schema';
import { buildBookingSearchFilter, normalizeBookingSearchTerm } from './search-utils';
import { z } from 'zod';

export async function GET(request: NextRequest) {
    try {
        const auth = await requireAuthenticatedSupabase();

        if (auth.response) {
            return auth.response;
        }

        const search = normalizeBookingSearchTerm(request.nextUrl.searchParams.get('search'));

        let query = auth.supabase
            .from('bookings')
            .select('*, services(name)')
            .order('created_at', { ascending: false })
            .order('id', { ascending: false });

        if (search) {
            query = query
                .or(buildBookingSearchFilter(search))
                .limit(100);
        }

        const { data, error } = await query;

        if (error) throw error;

        return NextResponse.json(data);
    } catch (error) {
        console.error('Failed to fetch bookings:', error);
        return jsonError('Failed to fetch bookings', 500);
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { service_id: serviceId, ...bookingInput } = formBookingRequestSchema.parse(body);
        const validatedData = validateBookingSchedule(bookingInput);

        const { data: service, error: serviceError } = await supabase()
            .from('services')
            .select('name, total_seats')
            .eq('id', serviceId)
            .single();

        if (serviceError) {
            return jsonError(
                serviceError.code === 'PGRST116' ? 'Service not found' : 'Failed to load service',
                supabaseErrorStatus(serviceError)
            );
        }

        const booking = await createConfirmedBooking({
            id: serviceId,
            ...service,
        }, validatedData);

        return NextResponse.json(booking, { status: 201 });
    } catch (error) {
        if (error instanceof BookingCreationError) {
            return jsonError(error.message, error.status, error.details);
        }

        if (error instanceof z.ZodError) {
            return jsonError('Invalid booking data', 400, { details: error.issues });
        }

        if (error instanceof SyntaxError) {
            return jsonError('Invalid JSON body', 400);
        }

        console.error('Failed to create booking:', error);
        return jsonError('Failed to create booking', 500);
    }
}
