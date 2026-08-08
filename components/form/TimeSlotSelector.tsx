'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { getSlotTimesInRange } from '@/lib/booking-schedule';
import type { TimeRangeSelection, TimeSlot } from '@/types';

interface Props {
    serviceId: string;
    date: string;
    onSelect: (selection: TimeRangeSelection) => void;
    selectedStart?: string;
    selectedEnd?: string;
    onSelectionUnavailable: () => void;
}

interface AvailabilityResponse {
    timeSlots: TimeSlot[];
    totalSeats: number;
}

async function availabilityFetcher([url, serviceId, date]: readonly [string, string, string]) {
    const response = await fetch(`${url}?service_id=${serviceId}&date=${date}`);
    const payload = await response.json().catch(() => null) as AvailabilityResponse & { error?: string } | null;

    if (!response.ok) {
        throw new Error(payload?.error || 'Failed to fetch time slots');
    }
    if (!payload || !Array.isArray(payload.timeSlots) || typeof payload.totalSeats !== 'number') {
        throw new Error('The availability service returned an invalid response');
    }

    return payload;
}

export default function TimeSlotSelector({
    serviceId,
    date,
    onSelect,
    selectedStart,
    selectedEnd,
    onSelectionUnavailable,
}: Props) {
    const [selectionError, setSelectionError] = useState('');
    const shouldFetch = Boolean(serviceId && date);
    const { data, error, isLoading, mutate } = useSWR(
        shouldFetch ? ['/api/availability', serviceId, date] as const : null,
        availabilityFetcher,
        {
            revalidateOnFocus: true,
            refreshInterval: 60_000,
        },
    );
    const slots = useMemo(() => data?.timeSlots ?? [], [data?.timeSlots]);
    const selectedTimes = useMemo(() => new Set(
        selectedStart && selectedEnd ? getSlotTimesInRange(selectedStart, selectedEnd) : [],
    ), [selectedEnd, selectedStart]);

    useEffect(() => {
        if (!data || selectedTimes.size === 0) {
            return;
        }

        const selectionIsStillAvailable = [...selectedTimes].every(time => (
            slots.some(slot => slot.start_time === time && slot.is_available)
        ));

        if (!selectionIsStillAvailable) {
            onSelectionUnavailable();
        }
    }, [data, onSelectionUnavailable, selectedTimes, slots]);

    const selectRange = (startTime: string, endTime: string) => {
        if (!data) {
            return;
        }

        const rangeTimes = getSlotTimesInRange(startTime, endTime);
        const rangeSlots = rangeTimes
            .map(time => slots.find(slot => slot.start_time === time))
            .filter((slot): slot is TimeSlot => Boolean(slot));

        if (rangeSlots.length !== rangeTimes.length || rangeSlots.some(slot => !slot.is_available)) {
            setSelectionError('Every hour in a booking must be available.');
            return;
        }

        const takenLabels = Array.from(new Set(rangeSlots.flatMap(slot => slot.taken_seat_labels)));
        const maintenanceLabels = Array.from(new Set(
            rangeSlots.flatMap(slot => slot.maintenance_seat_labels ?? []),
        ));
        const availableSeats = Math.max(0, data.totalSeats - takenLabels.length);
        if (availableSeats === 0) {
            setSelectionError('No single seat is available for that entire time range.');
            return;
        }

        setSelectionError('');
        onSelect({
            startTime,
            endTime,
            availableSeats,
            takenSeatLabels: takenLabels,
            maintenanceSeatLabels: maintenanceLabels,
        });
    };

    const handleSlotClick = (slot: TimeSlot) => {
        if (!selectedStart || !selectedEnd) {
            selectRange(slot.start_time, slot.end_time);
            return;
        }

        if (slot.start_time === selectedEnd) {
            selectRange(selectedStart, slot.end_time);
            return;
        }

        if (slot.end_time === selectedStart) {
            selectRange(slot.start_time, selectedEnd);
            return;
        }

        selectRange(slot.start_time, slot.end_time);
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-neon" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="mt-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                <p>{error instanceof Error ? error.message : 'Failed to load time slots.'}</p>
                <button
                    type="button"
                    onClick={() => void mutate()}
                    className="mt-2 font-semibold text-white underline hover:text-neon"
                >
                    Try again
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-4 mt-6">
            <h3 className="text-xl font-bold font-heading">Select Time Slots</h3>
            <p className="text-sm text-gray-400">
                Choose one slot, then click the next consecutive slots to extend your booking.
            </p>
            {selectionError && (
                <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                    {selectionError}
                </p>
            )}
            {selectedStart && selectedEnd && selectedTimes.size > 0 && (
                <p className="rounded-lg border border-neon/30 bg-neon/10 px-3 py-2 text-sm text-neon">
                    Selected: {selectedStart} - {selectedEnd} ({selectedTimes.size} {selectedTimes.size === 1 ? 'hour' : 'hours'})
                </p>
            )}
            {slots.length === 0 ? (
                <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-5 text-sm text-gray-300">
                    No bookable times remain for this date. Please choose another date.
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {slots.map(slot => {
                        const isSelected = selectedTimes.has(slot.start_time);

                        return (
                            <button
                                type="button"
                                key={slot.start_time}
                                onClick={() => handleSlotClick(slot)}
                                disabled={!slot.is_available}
                                aria-pressed={isSelected}
                                className={`px-4 py-4 rounded-lg text-sm font-medium transition-all duration-300 ${isSelected
                                    ? 'bg-neon text-racing-dark shadow-[0_0_15px_rgba(185,217,207,0.5)]'
                                    : slot.is_available
                                        ? 'bg-white/5 border border-white/20 hover:border-neon hover:bg-neon/10'
                                        : 'bg-white/5 border border-white/10 text-gray-600 cursor-not-allowed'
                                }`}
                            >
                                <div className="font-bold">{slot.start_time} - {slot.end_time}</div>
                                <div className={`text-xs mt-1 ${isSelected
                                    ? 'text-racing-dark/70'
                                    : slot.is_available ? 'text-neon' : 'text-gray-600'
                                }`}>
                                    {slot.is_available
                                        ? `${slot.available_seats} seats left`
                                        : 'Full'}
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
