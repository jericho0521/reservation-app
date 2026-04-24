import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { generateTimeSlots } from '@/lib/availability';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const serviceId = searchParams.get('service_id');
    const date = searchParams.get('date');

    if (!serviceId || !date) {
        return NextResponse.json(
            { error: 'service_id and date are required' },
            { status: 400 }
        );
    }

    try {
        // Get service to know total seats
        const { data: service, error: serviceError } = await supabase()
            .from('services')
            .select('total_seats')
            .eq('id', serviceId)
            .single();

        if (serviceError) throw serviceError;

        const totalSeats = service.total_seats;

        // Get existing bookings for this service and date
        const { data: bookings, error: bookingsError } = await supabase()
            .from('bookings')
            .select('start_time, end_time, seats_booked')
            .eq('service_id', serviceId)
            .eq('booking_date', date)
            .eq('status', 'confirmed');

        if (bookingsError) throw bookingsError;

        const timeSlots = generateTimeSlots(totalSeats, bookings || []);

        return NextResponse.json({ timeSlots, totalSeats });
    } catch (error) {
        console.error('Failed to check availability:', error);
        return NextResponse.json(
            { error: 'Failed to check availability' },
            { status: 500 }
        );
    }
}
