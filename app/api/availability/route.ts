import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { generateTimeSlots } from '@/lib/availability';
import { jsonError, supabaseErrorStatus } from '@/app/api/api-utils';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const serviceId = searchParams.get('service_id');
    const date = searchParams.get('date');

    if (!serviceId || !date) {
        return jsonError('service_id and date are required', 400);
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

        // Get existing bookings for this service and date
        const { data: bookings, error: bookingsError } = await supabaseAdmin()
            .from('bookings')
            .select('start_time, end_time, seats_booked, seat_labels')
            .eq('service_id', serviceId)
            .eq('booking_date', date)
            .eq('status', 'confirmed');

        if (bookingsError) throw bookingsError;

        const { data: maintenanceSeats, error: maintenanceError } = await supabaseAdmin()
            .from('service_seat_maintenance')
            .select('seat_label')
            .eq('service_id', serviceId)
            .eq('is_active', true);

        if (maintenanceError) throw maintenanceError;

        const maintenanceSeatLabels = (maintenanceSeats || [])
            .map(seat => seat.seat_label)
            .filter((label): label is string => typeof label === 'string');
        const timeSlots = generateTimeSlots(totalSeats, bookings || [], maintenanceSeatLabels);

        return NextResponse.json({ timeSlots, totalSeats });
    } catch (error) {
        console.error('Failed to check availability:', error);
        return jsonError('Failed to check availability', 500);
    }
}
