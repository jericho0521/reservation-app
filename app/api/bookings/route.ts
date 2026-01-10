import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { z } from 'zod';

const bookingSchema = z.object({
    service_id: z.string().uuid(),
    user_name: z.string().min(1),
    user_email: z.string().email(),
    booking_date: z.string(),
    start_time: z.string(),
    end_time: z.string(),
    seats_booked: z.number().positive(),
    interface_type: z.enum(['form', 'chat'])
});

export async function GET() {
    try {
        const { data, error } = await supabase
            .from('bookings')
            .select('*, services(name)')
            .order('booking_date', { ascending: false });

        if (error) throw error;

        return NextResponse.json(data);
    } catch (error) {
        console.error('Failed to fetch bookings:', error);
        return NextResponse.json(
            { error: 'Failed to fetch bookings' },
            { status: 500 }
        );
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const validatedData = bookingSchema.parse(body);

        // Get service to check total seats
        const { data: service, error: serviceError } = await supabase
            .from('services')
            .select('total_seats')
            .eq('id', validatedData.service_id)
            .single();

        if (serviceError) throw serviceError;

        // Check current bookings for this time slot
        const { data: existingBookings, error: bookingsError } = await supabase
            .from('bookings')
            .select('seats_booked')
            .eq('service_id', validatedData.service_id)
            .eq('booking_date', validatedData.booking_date)
            .eq('status', 'confirmed')
            .gte('end_time', validatedData.start_time)
            .lte('start_time', validatedData.end_time);

        if (bookingsError) throw bookingsError;

        const bookedSeats = (existingBookings || []).reduce(
            (sum, b) => sum + b.seats_booked,
            0
        );
        const availableSeats = service.total_seats - bookedSeats;

        if (validatedData.seats_booked > availableSeats) {
            return NextResponse.json(
                {
                    error: 'Not enough seats available',
                    available_seats: availableSeats
                },
                { status: 409 }
            );
        }

        // Create booking
        const { data, error } = await supabase
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
            return NextResponse.json(
                { error: 'Invalid booking data', details: error.errors },
                { status: 400 }
            );
        }
        console.error('Failed to create booking:', error);
        return NextResponse.json(
            { error: 'Failed to create booking' },
            { status: 500 }
        );
    }
}
