'use client';

import { useEffect, useMemo, useState } from 'react';
import { ReservableResource, ResourceLayout } from '@/types';

interface Props {
    totalSeats: number;
    maxAvailable: number;
    resources?: ReservableResource[];
    layout?: ResourceLayout;
    takenSeatLabels?: string[];
    maintenanceSeatLabels?: string[];
    onSelectionChange: (selectedSeats: number[], seatLabels: string[]) => void;
}

export function computeNextSeatSelection(selectedSeats: number[], seatNumber: number) {
    return selectedSeats.includes(seatNumber)
        ? selectedSeats.filter(seat => seat !== seatNumber)
        : [...selectedSeats, seatNumber];
}

function getSeatLabel(seatNumber: number) {
    return `RS${seatNumber}`;
}

function getFallbackResources(totalSeats: number): ReservableResource[] {
    return Array.from({ length: totalSeats }, (_, index) => ({
        id: `legacy-rs-${index + 1}`,
        service_id: 'legacy',
        label: getSeatLabel(index + 1),
        kind: 'seat',
        is_active: true,
        capacity: 1,
    }));
}

function isRacingSimulatorResourceSet(resources: Pick<ReservableResource, 'label'>[]) {
    if (resources.length !== 16) {
        return false;
    }

    const labels = new Set(resources.map(resource => resource.label.trim().toLowerCase()));
    return Array.from({ length: 16 }, (_, index) => `rs${index + 1}`)
        .every(label => labels.has(label));
}

export function getSeatNumbersFromLabels(seatLabels: string[], totalSeats: number) {
    return seatLabels
        .map(label => {
            const match = label.trim().match(/^RS\s*(\d{1,2})$/i);
            return match ? Number.parseInt(match[1], 10) : Number.NaN;
        })
        .filter(seatNumber => (
            Number.isInteger(seatNumber) &&
            seatNumber >= 1 &&
            seatNumber <= totalSeats
        ));
}

export function getResourceIndexesFromLabels(
    resourceLabels: string[],
    resources: Pick<ReservableResource, 'label'>[],
) {
    const normalizedIndexes = new Map(
        resources.map((resource, index) => [resource.label.trim().toLowerCase(), index + 1]),
    );

    return resourceLabels
        .map(label => normalizedIndexes.get(label.trim().toLowerCase()) ?? Number.NaN)
        .filter(resourceIndex => Number.isInteger(resourceIndex));
}

export default function SeatMap({ 
    totalSeats, 
    maxAvailable,
    resources,
    layout,
    takenSeatLabels = [],
    maintenanceSeatLabels = [],
    onSelectionChange 
}: Props) {
    const [selectedSeats, setSelectedSeats] = useState<number[]>([]);
    const selectableResources = useMemo(
        () => (resources && resources.length > 0 ? resources : getFallbackResources(totalSeats)),
        [resources, totalSeats],
    );
    const isRacingSimulatorLayout = isRacingSimulatorResourceSet(selectableResources);
    const resourceNoun = selectableResources[0]?.kind === 'seat' ? 'Seats' : 'Resources';
    const resourceIndexesByLabel = useMemo(
        () => new Map(
            selectableResources.map((resource, index) => [resource.label.trim().toLowerCase(), index + 1]),
        ),
        [selectableResources],
    );
    const maintenanceSeats = useMemo(
        () => getResourceIndexesFromLabels(maintenanceSeatLabels, selectableResources),
        [maintenanceSeatLabels, selectableResources],
    );
    const bookedSeats = useMemo(() => {
        const takenSeatNumbers = getResourceIndexesFromLabels(takenSeatLabels, selectableResources)
            .filter(seatNumber => !maintenanceSeats.includes(seatNumber));

        if (takenSeatNumbers.length > 0) {
            return takenSeatNumbers;
        }

        const unavailable = Math.max(0, selectableResources.length - maxAvailable - maintenanceSeats.length);
        return Array.from({ length: unavailable }, (_, index) => selectableResources.length - index);
    }, [selectableResources, maxAvailable, takenSeatLabels, maintenanceSeats]);

    useEffect(() => {
        onSelectionChange(
            selectedSeats,
            selectedSeats
                .map(seatNumber => selectableResources[seatNumber - 1]?.label)
                .filter((label): label is string => Boolean(label)),
        );
    }, [selectedSeats, selectableResources, onSelectionChange]);

    const toggleSeat = (seatNumber: number) => {
        if (bookedSeats.includes(seatNumber) || maintenanceSeats.includes(seatNumber)) return;

        setSelectedSeats(prev => computeNextSeatSelection(prev, seatNumber));
    };

    const getSeatStatus = (seatNumber: number) => {
        if (maintenanceSeats.includes(seatNumber)) return 'maintenance';
        if (bookedSeats.includes(seatNumber)) return 'booked';
        if (selectedSeats.includes(seatNumber)) return 'selected';
        return 'available';
    };

    const renderSeat = (seatNumber: number) => {
        const status = getSeatStatus(seatNumber);
        const label = selectableResources[seatNumber - 1]?.label ?? getSeatLabel(seatNumber);

        return (
            <button
                key={seatNumber}
                onClick={() => toggleSeat(seatNumber)}
                disabled={status === 'booked' || status === 'maintenance'}
                className={`
                    relative w-14 h-14 rounded-lg transition-all duration-200 
                    flex flex-col items-center justify-center
                    ${status === 'maintenance'
                        ? 'bg-amber-400/20 border border-amber-400/50 cursor-not-allowed'
                        : status === 'booked'
                        ? 'bg-red-500/20 border border-red-500/40 cursor-not-allowed' 
                        : status === 'selected'
                            ? 'bg-neon/30 border-2 border-neon shadow-[0_0_15px_rgba(185,217,207,0.4)] scale-105'
                            : 'bg-white/5 border border-white/20 hover:border-neon/50 hover:bg-white/10 hover:scale-105'
                    }
                `}
            >
                {/* Seat Icon */}
                <svg 
                    className={`w-6 h-6 ${
                        status === 'maintenance' ? 'text-amber-300' :
                        status === 'booked' ? 'text-red-400' :
                        status === 'selected' ? 'text-neon' : 'text-gray-500'
                    }`}
                    fill="currentColor" 
                    viewBox="0 0 24 24"
                >
                    <path d="M4 18v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h10v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h1v-4c0-.55-.45-1-1-1h-1V8c0-2.21-1.79-4-4-4H9C6.79 4 5 5.79 5 8v5H4c-.55 0-1 .45-1 1v4h1zm3-10c0-1.1.9-2 2-2h6c1.1 0 2 .9 2 2v5H7V8z"/>
                </svg>
                <span className={`text-xs font-bold mt-0.5 ${
                    status === 'selected' ? 'text-neon' : 'text-gray-500'
                }`}>
                    {label}
                </span>
                {status === 'selected' && (
                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-neon rounded-full flex items-center justify-center">
                        <svg className="w-2.5 h-2.5 text-racing-dark" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                )}
            </button>
        );
    };

    const renderResourceGrid = () => {
        const columns = layout?.kind === 'grid' ? Math.max(1, layout.columns) : 4;

        return (
            <div className="mx-auto grid max-w-2xl gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
                {selectableResources.map((resource, index) => renderSeat(index + 1))}
            </div>
        );
    };

    const renderCustomLayout = () => {
        if (layout?.kind !== 'custom' || layout.positions.length === 0) {
            return renderResourceGrid();
        }

        const resourcesById = new Map(selectableResources.map((resource, index) => [resource.id, index + 1]));
        const groupedPositions = layout.positions.reduce<Record<string, number[]>>((groups, position) => {
            const resourceIndex = resourcesById.get(position.resource_id);

            if (!resourceIndex) {
                return groups;
            }

            const groupLabel = position.group_label ?? 'Resources';
            groups[groupLabel] = [...(groups[groupLabel] ?? []), resourceIndex];
            return groups;
        }, {});

        if (Object.keys(groupedPositions).length === 0) {
            return renderResourceGrid();
        }

        return (
            <div className="flex flex-wrap justify-center gap-8">
                {Object.entries(groupedPositions).map(([groupLabel, resourceIndexes]) => (
                    <div key={groupLabel} className="space-y-2">
                        <div className="text-center text-xs text-gray-500 mb-2">{groupLabel}</div>
                        <div className="grid grid-cols-4 gap-2">
                            {resourceIndexes.map(renderSeat)}
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    const renderResourceLayout = () => {
        if (!isRacingSimulatorLayout) {
            return layout?.kind === 'custom' ? renderCustomLayout() : renderResourceGrid();
        }

        const seatIndex = (label: string) => resourceIndexesByLabel.get(label.toLowerCase()) ?? 0;
        const leftIslandRow1 = ['RS1', 'RS2', 'RS3', 'RS4'].map(seatIndex);
        const leftIslandRow2 = ['RS9', 'RS10', 'RS11', 'RS12'].map(seatIndex);
        const rightIslandRow1 = ['RS5', 'RS6', 'RS7', 'RS8'].map(seatIndex);
        const rightIslandRow2 = ['RS13', 'RS14', 'RS15', 'RS16'].map(seatIndex);

        const renderPcRail = () => (
            <div className="mb-3 w-full px-1">
                <div className="h-7 rounded-t-2xl border border-neon/30 border-b-0 bg-gradient-to-b from-neon/20 to-transparent shadow-[0_-8px_24px_rgba(185,217,207,0.08)]">
                    <div className="flex h-full items-center justify-center gap-1.5">
                        {Array.from({ length: 8 }, (_, index) => (
                            <span key={index} className="h-2.5 w-8 rounded-sm bg-neon/20 ring-1 ring-neon/25" />
                        ))}
                    </div>
                </div>
                <div className="text-center text-[10px] font-semibold uppercase tracking-[0.28em] text-neon/70">
                    PCs
                </div>
            </div>
        );

        const renderIsland = (topRow: number[], bottomRow: number[]) => (
            <div className="space-y-2">
                <div className="grid grid-cols-4 gap-2">
                    {topRow.map(renderSeat)}
                </div>
                <div className="grid grid-cols-4 gap-2">
                    {bottomRow.map(renderSeat)}
                </div>
            </div>
        );

        return (
            <div className="mx-auto max-w-[36rem]">
                {renderPcRail()}
                <div className="flex flex-col items-center justify-center gap-8 md:flex-row md:items-stretch">
                    {renderIsland(leftIslandRow1, leftIslandRow2)}
                    <div className="flex flex-col items-center justify-center text-gray-600">
                        <div className="hidden h-full w-px bg-white/10 md:block" />
                        <div className="h-px w-40 bg-white/10 md:hidden" />
                    </div>
                    {renderIsland(rightIslandRow1, rightIslandRow2)}
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-6">
            <div className="text-center">
                <h3 className="text-xl font-bold font-heading mb-1">Select Your {resourceNoun}</h3>
                <p className="text-sm text-gray-400">
                    Click on available {resourceNoun.toLowerCase()} - {selectedSeats.length} selected
                </p>
            </div>

            {renderResourceLayout()}

            {/* Legend */}
            <div className="flex justify-center gap-6 text-xs pt-2">
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-white/5 border border-white/20 rounded" />
                    <span className="text-gray-400">Available</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-neon/30 border-2 border-neon rounded" />
                    <span className="text-neon">Selected</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-red-500/20 border border-red-500/40 rounded" />
                    <span className="text-gray-400">Taken</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-amber-400/20 border border-amber-400/50 rounded" />
                    <span className="text-gray-400">Maintenance</span>
                </div>
            </div>

            {/* Selection Summary */}
            {selectedSeats.length > 0 && (
                <div className="p-3 bg-neon/10 border border-neon/30 rounded-lg text-center">
                    <p className="text-sm text-neon font-medium">
                        {selectedSeats.length} {resourceNoun.toLowerCase().replace(/s$/, '')}{selectedSeats.length > 1 ? 's' : ''}: {' '}
                        {[...selectedSeats].sort((a, b) => a - b).map(s => selectableResources[s - 1]?.label ?? getSeatLabel(s)).join(', ')}
                    </p>
                </div>
            )}
        </div>
    );
}
