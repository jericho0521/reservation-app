import { NextResponse } from 'next/server';
import { jsonError, requireAdminSupabase, supabaseErrorStatus } from '@/app/api/api-utils';
import { z } from 'zod';
import { bookingUpdateSchema } from '../update-schema';

const bookingIdSchema = z.string().uuid();

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const auth = await requireAdminSupabase();

        if (auth.response) {
            return auth.response;
        }

        const { id } = await params;
        const bookingId = bookingIdSchema.parse(id);

        const { data, error } = await auth.supabase
            .from('bookings')
            .select('*, services(name)')
            .eq('id', bookingId)
            .single();

        if (error) {
            return jsonError(
                supabaseErrorStatus(error) === 404 ? 'Booking not found' : 'Failed to fetch booking',
                supabaseErrorStatus(error)
            );
        }

        return NextResponse.json(data);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return jsonError('Invalid booking id', 400, { details: error.issues });
        }

        console.error('Failed to fetch booking:', error);
        return jsonError('Failed to fetch booking', 500);
    }
}

export async function PUT(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const auth = await requireAdminSupabase();

        if (auth.response) {
            return auth.response;
        }

        const { id } = await params;
        const bookingId = bookingIdSchema.parse(id);
        const body = await request.json();
        const validatedData = bookingUpdateSchema.parse(body);

        const { data, error } = await auth.supabase
            .from('bookings')
            .update({
                ...validatedData,
                updated_at: new Date().toISOString()
            })
            .eq('id', bookingId)
            .select()
            .single();

        if (error) {
            return jsonError(
                supabaseErrorStatus(error) === 404 ? 'Booking not found' : 'Failed to update booking',
                supabaseErrorStatus(error)
            );
        }

        return NextResponse.json(data);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return jsonError('Invalid booking update data', 400, { details: error.issues });
        }

        if (error instanceof SyntaxError) {
            return jsonError('Invalid JSON body', 400);
        }

        console.error('Failed to update booking:', error);
        return jsonError('Failed to update booking', 500);
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const auth = await requireAdminSupabase();

        if (auth.response) {
            return auth.response;
        }

        const { id } = await params;
        const bookingId = bookingIdSchema.parse(id);

        const { data, error } = await auth.supabase
            .from('bookings')
            .update({
                status: 'cancelled',
                updated_at: new Date().toISOString()
            })
            .eq('id', bookingId)
            .select()
            .single();

        if (error) {
            return jsonError(
                supabaseErrorStatus(error) === 404 ? 'Booking not found' : 'Failed to cancel booking',
                supabaseErrorStatus(error)
            );
        }

        return NextResponse.json({ message: 'Booking cancelled', data });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return jsonError('Invalid booking id', 400, { details: error.issues });
        }

        console.error('Failed to cancel booking:', error);
        return jsonError('Failed to cancel booking', 500);
    }
}
