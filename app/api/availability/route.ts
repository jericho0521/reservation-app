import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

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
        const { data: service, error: serviceError } = await supabase
            .from('services')
            .select('total_seats')
            .eq('id', serviceId)
            .single();

        if (serviceError) throw serviceError;

        const totalSeats = service.total_seats;

        // Get existing bookings for this service and date
        const { data: bookings, error: bookingsError } = await supabase
            .from('bookings')
            .select('start_time, end_time, seats_booked')
            .eq('service_id', serviceId)
            .eq('booking_date', date)
            .eq('status', 'confirmed');

        if (bookingsError) throw bookingsError;

        // Generate time slots (12 PM - 1 AM, 1-hour intervals)
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

function generateTimeSlots(
    totalSeats: number,
    bookings: { start_time: string; end_time: string; seats_booked: number }[]
) {
    const slots = [];

    // Hours: 12 PM (12) to 1 AM (25, representing next day's 1:00)
    // 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0 (midnight), 1 AM end
    const hours = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0];

    for (const hour of hours) {
        const startTime = `${hour.toString().padStart(2, '0')}:00`;
        const endHour = hour === 0 ? 1 : hour + 1;
        const endTime = `${endHour.toString().padStart(2, '0')}:00`;

        // Calculate booked seats for this time slot
        const bookedSeats = bookings
            .filter(booking => {
                const bookingStart = booking.start_time.slice(0, 5);
                const bookingEnd = booking.end_time.slice(0, 5);
                // Check for overlap
                return (
                    (startTime >= bookingStart && startTime < bookingEnd) ||
                    (endTime > bookingStart && endTime <= bookingEnd) ||
                    (startTime <= bookingStart && endTime >= bookingEnd)
                );
            })
            .reduce((sum, booking) => sum + booking.seats_booked, 0);

        const availableSeats = totalSeats - bookedSeats;

        slots.push({
            start_time: startTime,
            end_time: endTime,
            available_seats: Math.max(0, availableSeats),
            is_available: availableSeats > 0
        });
    }

    return slots;
}
