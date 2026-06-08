import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { jsonError, requireAuthenticatedSupabase } from '@/app/api/api-utils';
import {
    createSupabaseReservationRepository,
} from '@project-play/reservations-supabase';
import {
    adaptLegacyBooking,
    type Reservation,
    type ReservationItem,
} from '@project-play/reservations-core';
import { z } from 'zod';

const reservationItemSchema = z.object({
    resource_id: z.string().uuid().optional().nullable(),
    resource_label: z.string().min(1).optional().nullable(),
    quantity: z.number().int().positive(),
});

const bookingSchema = z.object({
    service_id: z.string().uuid(),
    user_name: z.string().min(1),
    user_email: z.string().email(),
    user_phone: z.string().min(1),
    booking_date: z.string(),
    start_time: z.string(),
    end_time: z.string(),
    seats_booked: z.number().positive(),
    seat_labels: z.array(z.string()).optional(),
    items: z.array(reservationItemSchema).optional(),
    reservation_items: z.array(reservationItemSchema).optional(),
    interface_type: z.enum(['form', 'chat'])
});

const MAX_SEARCH_LENGTH = 100;

function quotePostgrestValue(value: string) {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function escapeLikeTerm(value: string) {
    return value.replace(/[\\%_]/g, '\\$&');
}

export function normalizeBookingSearchTerm(search: string | null) {
    const normalized = search?.trim().slice(0, MAX_SEARCH_LENGTH) ?? '';
    return normalized.length > 0 ? normalized : null;
}

export function buildBookingSearchFilter(search: string) {
    const term = quotePostgrestValue(`%${escapeLikeTerm(search)}%`);
    return `user_name.ilike.${term},user_email.ilike.${term},user_phone.ilike.${term}`;
}

function atomicBookingErrorResponse(
    error: string,
    validation: {
        available_quantity?: number;
        conflicting_resource_labels?: string[];
    },
) {
    if (error === 'invalid_service') {
        return jsonError('Service not found', 404);
    }

    if (error === 'invalid_reservation') {
        return jsonError('Invalid booking data', 400);
    }

    if (error === 'invalid_resource_labels') {
        return jsonError('Selected seat labels are not valid for this service', 400, {
            seat_labels: validation.conflicting_resource_labels ?? [],
        });
    }

    if (error === 'missing_resource_labels') {
        return jsonError('Selected seat labels must match booked seats', 400, {
            seat_labels: validation.conflicting_resource_labels ?? [],
        });
    }

    if (error === 'not_enough_capacity') {
        return jsonError('Not enough seats available', 409, {
            available_seats: validation.available_quantity ?? 0
        });
    }

    if (error === 'maintenance_conflict') {
        return jsonError('Some selected seats are under maintenance', 409, {
            seat_labels: validation.conflicting_resource_labels ?? [],
        });
    }

    if (error === 'resource_conflict') {
        return jsonError('Some selected seats are no longer available', 409, {
            seat_labels: validation.conflicting_resource_labels ?? [],
        });
    }

    return jsonError('Failed to create booking', 500);
}

function getReservationItems(
    booking: z.infer<typeof bookingSchema>,
): ReservationItem[] | null {
    const rawItems = booking.items ?? booking.reservation_items;

    if (!rawItems) {
        return null;
    }

    return rawItems.map((item) => ({
        ...(item.resource_id ? { resource_id: item.resource_id } : {}),
        ...(item.resource_label ? { resource_label: item.resource_label } : {}),
        quantity: item.quantity,
    }));
}

function getItemResourceLabels(items: ReservationItem[]) {
    return Array.from(new Set(
        items
            .map((item) => item.resource_label)
            .filter((label): label is string => typeof label === 'string' && label.trim().length > 0),
    ));
}

function bookingToReservation(
    booking: z.infer<typeof bookingSchema>,
): Reservation {
    const nativeItems = getReservationItems(booking);

    if (!nativeItems) {
        return adaptLegacyBooking({
            ...booking,
            status: 'confirmed',
        });
    }

    const seatLabels = booking.seat_labels ?? getItemResourceLabels(nativeItems);

    return {
        service_id: booking.service_id,
        customer_name: booking.user_name,
        customer_email: booking.user_email,
        customer_phone: booking.user_phone,
        booking_date: booking.booking_date,
        start_time: booking.start_time,
        end_time: booking.end_time,
        quantity: booking.seats_booked,
        items: nativeItems,
        status: 'confirmed',
        interface_type: booking.interface_type,
        seats_booked: booking.seats_booked,
        seat_labels: seatLabels,
    };
}

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
            .order('booking_date', { ascending: false });

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

export async function createBookingResponse(
    body: unknown,
    bookingClient?: Parameters<typeof createSupabaseReservationRepository>[0],
) {
    const validatedData = bookingSchema.parse(body);
    const client = bookingClient ?? (
        supabaseAdmin() as unknown as Parameters<typeof createSupabaseReservationRepository>[0]
    );
    const repository = createSupabaseReservationRepository(client);
    const result = await repository.createReservationAtomic({
        reservation: bookingToReservation(validatedData),
    });

    if (!result.ok) {
        return atomicBookingErrorResponse(result.error, result.validation);
    }

    return NextResponse.json(result.booking, { status: 201 });
}

export async function POST(request: Request) {
    try {
        const body = await request.json();

        return await createBookingResponse(body);
    } catch (error) {
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
