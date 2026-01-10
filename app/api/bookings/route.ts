import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { z } from 'zod';

const bookingSchema = z.object({
    venue_id: z.string().uuid(),
    user_name: z.string().min(1),
    user_email: z.string().email(),
    booking_date: z.string(),
    start_time: z.string(),
    end_time: z.string(),
    capacity_needed: z.number().positive(),
    equipment_needed: z.array(z.string()).optional(),
    interface_type: z.enum(['form', 'chat'])
});

export async function GET() {
    try {
        const { data, error } = await supabase
            .from('bookings')
            .select('*, venues(name)')
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

        // Check for conflicts
        const { data: conflicts } = await supabase
            .from('bookings')
            .select('id')
            .eq('venue_id', validatedData.venue_id)
            .eq('booking_date', validatedData.booking_date)
            .eq('status', 'confirmed')
            .gte('end_time', validatedData.start_time)
            .lte('start_time', validatedData.end_time);

        if (conflicts && conflicts.length > 0) {
            return NextResponse.json(
                { error: 'Time slot not available' },
                { status: 409 }
            );
        }

        // Create booking
        const { data, error } = await supabase
            .from('bookings')
            .insert([{
                ...validatedData,
                status: 'confirmed',
                equipment_needed: validatedData.equipment_needed || []
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
