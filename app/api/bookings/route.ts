import { NextResponse, NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
    getAvailableSeatsWithMaintenance,
    getBookingsForSlot,
    getConflictingSeatLabels,
} from '@/lib/reservation-capacity';
import { getMaintenanceSeatConflicts } from '@/lib/seat-maintenance';
import { jsonError, requireAuthenticatedSupabase, supabaseErrorStatus } from '@/app/api/api-utils';
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

export async function GET(request: NextRequest) {
    try {
        const auth = await requireAuthenticatedSupabase();

        if (auth.response) {
            return auth.response;
        }

        const search = request.nextUrl.searchParams.get('search') || null;

        let query = auth.supabase
            .from('bookings')
            .select('*, services(name)')
            .order('booking_date', { ascending: false });

        if (search) {
            const term = `%${search}%`;
            query = query
                .or(`user_name.ilike.${term},user_email.ilike.${term},user_phone.ilike.${term}`)
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

        // Get service to check total seats
        const { data: service, error: serviceError } = await supabase()
            .from('services')
            .select('total_seats')
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
            .select('start_time, seats_booked, seat_labels')
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

        const sameSlotBookings = getBookingsForSlot(
            existingBookings || [],
            validatedData.start_time,
        );
        const maintenanceSeatLabels = (maintenanceSeats || [])
            .map(seat => seat.seat_label)
            .filter((label): label is string => typeof label === 'string');
        const availableSeats = getAvailableSeatsWithMaintenance(
            service.total_seats,
            sameSlotBookings,
            maintenanceSeatLabels,
        );
        const requestedSeatLabels = validatedData.seat_labels ?? [];

        if (
            service.total_seats === 16 &&
            requestedSeatLabels.length !== validatedData.seats_booked
        ) {
            return jsonError('Selected seat labels must match booked seats', 400);
        }

        if (validatedData.seats_booked > availableSeats) {
            return jsonError('Not enough seats available', 409, {
                available_seats: availableSeats
            });
        }

        const maintenanceConflicts = getMaintenanceSeatConflicts(
            requestedSeatLabels,
            maintenanceSeatLabels,
        );

        if (maintenanceConflicts.length > 0) {
            return jsonError('Some selected seats are under maintenance', 409, {
                seat_labels: maintenanceConflicts,
            });
        }

        const conflictingSeatLabels = getConflictingSeatLabels(
            sameSlotBookings,
            requestedSeatLabels,
        );

        if (conflictingSeatLabels.length > 0) {
            return jsonError('Some selected seats are no longer available', 409, {
                seat_labels: conflictingSeatLabels,
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
