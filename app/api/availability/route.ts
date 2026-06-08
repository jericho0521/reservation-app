import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
    adaptBookingRows,
    adaptServiceMetadata,
    getAvailabilityMetadata,
    getLegacyFallbackLabels,
} from '@project-play/reservations-supabase';
import { generateAvailabilityTimeSlots } from '@project-play/reservations-core';
import { jsonError, supabaseErrorStatus } from '@/app/api/api-utils';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const serviceId = searchParams.get('service_id');
    const date = searchParams.get('date');

    if (!serviceId || !date) {
        return jsonError('service_id and date are required', 400);
    }

    try {
        // Get service metadata for generic reservation adapters.
        const { data: service, error: serviceError } = await supabase()
            .from('services')
            .select('id, name, description, total_seats, created_at, resource_kind, selection_mode, reservation_policy')
            .eq('id', serviceId)
            .single();

        if (serviceError) {
            return jsonError(
                supabaseErrorStatus(serviceError) === 404 ? 'Service not found' : 'Failed to load service',
                supabaseErrorStatus(serviceError)
            );
        }

        // Get existing bookings for this service and date
        const { data: bookings, error: bookingsError } = await supabaseAdmin()
            .from('bookings')
            .select('id, service_id, user_name, user_email, user_phone, booking_date, start_time, end_time, seats_booked, seat_labels, status, interface_type')
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

        const { data: resources, error: resourcesError } = await supabaseAdmin()
            .from('reservable_resources')
            .select('id, service_id, label, kind, is_active, capacity, metadata')
            .eq('service_id', serviceId);

        if (resourcesError) throw resourcesError;

        const { data: layout, error: layoutError } = await supabaseAdmin()
            .from('resource_layouts')
            .select('layout_kind, metadata')
            .eq('service_id', serviceId)
            .maybeSingle();

        if (layoutError) throw layoutError;

        const maintenanceSeatLabels = (maintenanceSeats || [])
            .map(seat => seat.seat_label)
            .filter((label): label is string => typeof label === 'string');
        const reservationService = adaptServiceMetadata(service, resources || [], layout);
        const timeSlots = generateAvailabilityTimeSlots(
            reservationService,
            adaptBookingRows((bookings || []).map((booking) => ({
                ...booking,
                interface_type: booking.interface_type === 'chat' ? 'chat' : 'form',
            }))),
            {
                maintenanceResourceLabels: maintenanceSeatLabels,
                legacyFallbackLabels: getLegacyFallbackLabels(reservationService),
            },
        );

        return NextResponse.json({
            timeSlots,
            totalSeats: reservationService.total_seats,
            ...getAvailabilityMetadata(reservationService),
        });
    } catch (error) {
        console.error('Failed to check availability:', error);
        return jsonError('Failed to check availability', 500);
    }
}
