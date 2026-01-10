'use client';

import { Booking } from '@/types';

interface Props {
    booking: Partial<Booking> & { service_name?: string };
}

export default function BookingSummary({ booking }: Props) {
    const formatDate = (dateStr?: string) => {
        if (!dateStr) return 'Not selected';
        return new Date(dateStr).toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold font-heading">Review Your Booking</h2>

            <div className="bg-white/5 border border-white/20 rounded-lg p-6 space-y-4">
                <div className="flex justify-between border-b border-white/10 pb-4">
                    <span className="text-gray-400">Service</span>
                    <span className="font-medium text-neon">{booking.service_name || 'Loading...'}</span>
                </div>

                <div className="flex justify-between border-b border-white/10 pb-4">
                    <span className="text-gray-400">Date</span>
                    <span className="font-medium">{formatDate(booking.booking_date)}</span>
                </div>

                <div className="flex justify-between border-b border-white/10 pb-4">
                    <span className="text-gray-400">Time</span>
                    <span className="font-medium">{booking.start_time} - {booking.end_time}</span>
                </div>

                <div className="flex justify-between border-b border-white/10 pb-4">
                    <span className="text-gray-400">Seats</span>
                    <span className="font-medium text-neon">{booking.seats_booked} {booking.seats_booked === 1 ? 'seat' : 'seats'}</span>
                </div>

                <div className="flex justify-between border-b border-white/10 pb-4">
                    <span className="text-gray-400">Name</span>
                    <span className="font-medium">{booking.user_name}</span>
                </div>

                <div className="flex justify-between">
                    <span className="text-gray-400">Email</span>
                    <span className="font-medium">{booking.user_email}</span>
                </div>
            </div>

            <p className="text-sm text-gray-400 text-center">
                Please review your booking details before confirming.
            </p>
        </div>
    );
}
