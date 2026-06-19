'use client';

import useSWR from 'swr';
import { AvailabilityResponse } from '@/types';
import { getReservationAvailability } from '@/lib/reservation-platform-client';

interface Props {
    serviceId: string;
    date: string;
    onSelect: (
        startTime: string,
        endTime: string,
        availableSeats: number,
        takenSeatLabels: string[],
        maintenanceSeatLabels: string[],
        metadata: AvailabilityResponse,
    ) => void;
    selectedStart?: string;
}

async function availabilityFetcher([, serviceId, date]: readonly [string, string, string]) {
    return getReservationAvailability(serviceId, date);
}

export default function TimeSlotSelector({ serviceId, date, onSelect, selectedStart }: Props) {
    const shouldFetch = Boolean(serviceId && date);
    const { data, error, isLoading } = useSWR(
        shouldFetch ? ['reservation-availability', serviceId, date] as const : null,
        availabilityFetcher,
        {
            revalidateOnFocus: false,
        },
    );
    const slots = data?.timeSlots ?? [];

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-neon"></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="mt-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                Failed to load time slots. Please try another date.
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
                        onClick={() => slot.is_available && onSelect(
                            slot.start_time,
                            slot.end_time,
                            slot.available_seats,
                            slot.taken_seat_labels,
                            slot.maintenance_seat_labels ?? [],
                            data ?? {},
                        )}
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
