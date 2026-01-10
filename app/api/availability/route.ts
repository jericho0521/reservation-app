import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const venueId = searchParams.get('venue_id');
    const date = searchParams.get('date');

    if (!venueId || !date) {
        return NextResponse.json(
            { error: 'venue_id and date are required' },
            { status: 400 }
        );
    }

    try {
        // Check existing bookings for this venue and date
        const { data: bookings, error: bookingsError } = await supabase
            .from('bookings')
            .select('start_time, end_time')
            .eq('venue_id', venueId)
            .eq('booking_date', date)
            .eq('status', 'confirmed');

        if (bookingsError) throw bookingsError;

        // Generate available time slots (9 AM - 5 PM, 1-hour slots)
        const timeSlots = generateTimeSlots(bookings || []);

        return NextResponse.json({ timeSlots });
    } catch (error) {
        console.error('Failed to check availability:', error);
        return NextResponse.json(
            { error: 'Failed to check availability' },
            { status: 500 }
        );
    }
}

function generateTimeSlots(bookings: { start_time: string; end_time: string }[]) {
    const slots = [];
    const startHour = 9;  // 9 AM
    const endHour = 17;   // 5 PM

    for (let hour = startHour; hour < endHour; hour++) {
        const startTime = `${hour.toString().padStart(2, '0')}:00`;
        const endTime = `${(hour + 1).toString().padStart(2, '0')}:00`;

        // Check if slot conflicts with existing bookings
        const isAvailable = !bookings.some(booking => {
            const bookingStart = booking.start_time.slice(0, 5);
            const bookingEnd = booking.end_time.slice(0, 5);
            return (
                (startTime >= bookingStart && startTime < bookingEnd) ||
                (endTime > bookingStart && endTime <= bookingEnd)
            );
        });

        slots.push({
            start_time: startTime,
            end_time: endTime,
            is_available: isAvailable
        });
    }

    return slots;
}
