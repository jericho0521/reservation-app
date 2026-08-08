'use client';

import { getBookingDateBounds } from '@/lib/booking-schedule';

interface Props {
    selected?: string;
    onSelect: (date: string) => void;
}

export default function DatePicker({ selected, onSelect }: Props) {
    const { minDate, maxDate } = getBookingDateBounds();

    return (
        <div className="space-y-4">
            <h2 className="text-2xl font-bold font-heading mb-6">Select a Date</h2>
            <div className="max-w-sm">
                <input
                    type="date"
                    value={selected || ''}
                    onChange={(e) => onSelect(e.target.value)}
                    min={minDate}
                    max={maxDate}
                    className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white focus:border-neon focus:outline-none focus:ring-1 focus:ring-neon transition-colors"
                />
                <p className="text-sm text-gray-400 mt-2">
                    Bookings available up to 30 days in advance. Midnight and 1 AM belong to the operating date that started the previous afternoon.
                </p>
            </div>
        </div>
    );
}
