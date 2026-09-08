import { bookingRequestContext, RequestControlError } from '@/lib/request-controls';
import { readLimitedJson, RequestBodyError } from '@/lib/request-body';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { jsonError, requireAdminSupabase, supabaseErrorStatus } from '@/app/api/api-utils';
import { walkInBookingRequestSchema } from '@/lib/booking-schema';
import {
    BookingCreationError,
    createConfirmedBooking,
    validateBookingSchedule,
} from '@/lib/create-booking';

/**
 * Records a walk-in booking on behalf of a customer who is already at the
 * venue. Runs the same capacity, seat, and maintenance checks as a customer
 * booking so a walk-in can never double-book a seat.
 */
export async function POST(request: Request) {
    try {
        const auth = await requireAdminSupabase();

        if (auth.response) {
            return auth.response;
        }

        const body = await readLimitedJson(request);
        const { service_id: serviceId, ...bookingInput } = walkInBookingRequestSchema.parse(body);
        const validatedData = validateBookingSchedule(bookingInput, { allowStartedSlot: true });

        const { data: service, error: serviceError } = await auth.supabase
            .from('services')
            .select('name, total_seats')
            .eq('id', serviceId)
            .single();

        if (serviceError) {
            return jsonError(
                supabaseErrorStatus(serviceError) === 404 ? 'Service not found' : 'Failed to load service',
                supabaseErrorStatus(serviceError),
            );
        }

        const booking = await createConfirmedBooking({ id: serviceId, ...service }, validatedData, bookingRequestContext(request, auth.user.id));

        return NextResponse.json(booking, { status: 201 });
    } catch (error) {
        if (error instanceof RequestControlError || error instanceof RequestBodyError) return jsonError(error.message, error.status);
        if (error instanceof BookingCreationError) {
            return jsonError(error.message, error.status, error.details);
        }

        if (error instanceof z.ZodError) {
            return jsonError('Invalid booking data', 400, { details: error.issues });
        }

        if (error instanceof SyntaxError) {
            return jsonError('Invalid JSON body', 400);
        }

        const maybeDbError = error as { code?: string; message?: string } | null;
        if (maybeDbError?.code === '23514' && maybeDbError.message?.includes('interface_type')) {
            console.error('Walk-in bookings need the supabase/walk-in-bookings.sql migration:', error);
            return jsonError(
                'The database does not accept walk-in bookings yet. Run supabase/walk-in-bookings.sql and try again.',
                500,
            );
        }

        console.error('Failed to create walk-in booking:', error);
        return jsonError('Failed to create walk-in booking', 500);
    }
}
