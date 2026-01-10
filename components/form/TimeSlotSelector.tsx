'use client';

import { useState, useEffect } from 'react';
import { TimeSlot } from '@/types';

interface Props {
    serviceId: string;
    date: string;
    onSelect: (startTime: string, endTime: string, availableSeats: number) => void;
    selectedStart?: string;
}

export default function TimeSlotSelector({ serviceId, date, onSelect, selectedStart }: Props) {
    const [slots, setSlots] = useState<TimeSlot[]>([]);
    const [loading, setLoading] = useState(true);
    const [totalSeats, setTotalSeats] = useState(0);

    useEffect(() => {
        if (serviceId && date) {
            fetchSlots();
        }
    }, [serviceId, date]);

    const fetchSlots = async () => {
        setLoading(true);
        try {
            const response = await fetch(`/api/availability?service_id=${serviceId}&date=${date}`);
            const data = await response.json();
            setSlots(data.timeSlots || []);
            setTotalSeats(data.totalSeats || 0);
        } catch (error) {
            console.error('Failed to fetch time slots:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-neon"></div>
            </div>
        );
    }

    return (
        <div className="space-y-4 mt-6">
            <h3 className="text-xl font-bold font-heading">Select a Time Slot</h3>
            <p className="text-sm text-gray-400">Available seats shown for each time slot</p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {slots.map(slot => (
                    <button
                        key={slot.start_time}
                        onClick={() => slot.is_available && onSelect(slot.start_time, slot.end_time, slot.available_seats)}
                        disabled={!slot.is_available}
                        className={`px-4 py-4 rounded-lg text-sm font-medium transition-all duration-300 ${selectedStart === slot.start_time
                                ? 'bg-neon text-racing-dark shadow-[0_0_15px_rgba(185,217,207,0.5)]'
                                : slot.is_available
                                    ? 'bg-white/5 border border-white/20 hover:border-neon hover:bg-neon/10'
                                    : 'bg-white/5 border border-white/10 text-gray-600 cursor-not-allowed'
                            }`}
                    >
                        <div className="font-bold">{slot.start_time} - {slot.end_time}</div>
                        <div className={`text-xs mt-1 ${selectedStart === slot.start_time
                                ? 'text-racing-dark/70'
                                : slot.is_available
                                    ? 'text-neon'
                                    : 'text-gray-600'
                            }`}>
                            {slot.is_available
                                ? `${slot.available_seats} seats left`
                                : 'Full'}
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
}
