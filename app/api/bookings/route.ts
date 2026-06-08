import { NextResponse, NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
    getBookingsForSlot,
} from '@/lib/reservation-capacity';
import { jsonError, requireAuthenticatedSupabase, supabaseErrorStatus } from '@/app/api/api-utils';
import {
    adaptBookingRows,
    adaptServiceMetadata,
} from '@project-play/reservations-supabase';
import {
    adaptLegacyBooking,
    validateReservationRequest,
} from '@project-play/reservations-core';
import { z } from 'zod';

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

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const validatedData = bookingSchema.parse(body);

        // Get service metadata for generic reservation validation.
        const { data: service, error: serviceError } = await supabase()
            .from('services')
            .select('id, name, description, total_seats, created_at, resource_kind, selection_mode, reservation_policy')
            .eq('id', validatedData.service_id)
            .single();

        if (serviceError) {
            return jsonError(
                serviceError.code === 'PGRST116' ? 'Service not found' : 'Failed to load service',
                supabaseErrorStatus(serviceError)
            );
        }

        // Check current bookings for this time slot
        const bookingClient = supabaseAdmin();

        const { data: existingBookings, error: bookingsError } = await bookingClient
            .from('bookings')
            .select('id, service_id, user_name, user_email, user_phone, booking_date, start_time, end_time, seats_booked, seat_labels, status, interface_type')
            .eq('service_id', validatedData.service_id)
            .eq('booking_date', validatedData.booking_date)
            .eq('status', 'confirmed');

        if (bookingsError) throw bookingsError;

        const { data: maintenanceSeats, error: maintenanceError } = await bookingClient
            .from('service_seat_maintenance')
            .select('seat_label')
            .eq('service_id', validatedData.service_id)
            .eq('is_active', true);

        if (maintenanceError) throw maintenanceError;

        const { data: resources, error: resourcesError } = await bookingClient
            .from('reservable_resources')
            .select('id, service_id, label, kind, is_active, capacity, metadata')
            .eq('service_id', validatedData.service_id);

        if (resourcesError) throw resourcesError;

        const { data: layout, error: layoutError } = await bookingClient
            .from('resource_layouts')
            .select('layout_kind, metadata')
            .eq('service_id', validatedData.service_id)
            .maybeSingle();

        if (layoutError) throw layoutError;

        const sameSlotBookings = getBookingsForSlot(
            existingBookings || [],
            validatedData.start_time,
        );
        const maintenanceSeatLabels = (maintenanceSeats || [])
            .map(seat => seat.seat_label)
            .filter((label): label is string => typeof label === 'string');
        const reservationService = adaptServiceMetadata(service, resources || [], layout);
        const validation = validateReservationRequest(
            reservationService,
            adaptBookingRows(sameSlotBookings.map((booking) => ({
                ...booking,
                interface_type: booking.interface_type === 'chat' ? 'chat' : 'form',
            }))),
            adaptLegacyBooking(validatedData),
            maintenanceSeatLabels,
        );

        if (validation.error === 'missing_resource_labels') {
            return jsonError('Selected seat labels must match booked seats', 400);
        }

        if (validation.error === 'not_enough_capacity') {
            return jsonError('Not enough seats available', 409, {
                available_seats: validation.available_quantity ?? 0
            });
        }

        if (validation.error === 'maintenance_conflict') {
            return jsonError('Some selected seats are under maintenance', 409, {
                seat_labels: validation.conflicting_resource_labels ?? [],
            });
        }

        if (validation.error === 'resource_conflict') {
            return jsonError('Some selected seats are no longer available', 409, {
                seat_labels: validation.conflicting_resource_labels ?? [],
            });
        }

        // Create booking
        const { data, error } = await bookingClient
            .from('bookings')
            .insert([{
                ...validatedData,
                status: 'confirmed'
            }])
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json(data, { status: 201 });
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
