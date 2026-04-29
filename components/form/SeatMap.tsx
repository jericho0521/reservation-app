'use client';

import { useMemo, useState } from 'react';

interface Props {
    totalSeats: number;
    maxAvailable: number;
    takenSeatLabels?: string[];
    onSelectionChange: (selectedSeats: number[], seatLabels: string[]) => void;
}

export default function SeatMap({ 
    totalSeats, 
    maxAvailable,
    takenSeatLabels = [],
    onSelectionChange 
}: Props) {
    const [selectedSeats, setSelectedSeats] = useState<number[]>([]);
    const bookedSeats = useMemo(() => {
        const takenSeatNumbers = takenSeatLabels
            .map(label => Number.parseInt(label.replace(/\D/g, ''), 10))
            .filter(seatNumber => (
                Number.isInteger(seatNumber) &&
                seatNumber >= 1 &&
                seatNumber <= totalSeats
            ));

        if (takenSeatNumbers.length > 0) {
            return takenSeatNumbers;
        }

        const unavailable = Math.max(0, totalSeats - maxAvailable);
        return Array.from({ length: unavailable }, (_, index) => totalSeats - index);
    }, [totalSeats, maxAvailable, takenSeatLabels]);

    const getSeatLabel = (seatNumber: number) => {
        return `RS${seatNumber}`;
    };

    const toggleSeat = (seatNumber: number) => {
        if (bookedSeats.includes(seatNumber)) return;
        
        setSelectedSeats(prev => {
            const newSelection = prev.includes(seatNumber)
                ? prev.filter(s => s !== seatNumber)
                : [...prev, seatNumber];
            
            const labels = newSelection.map(s => getSeatLabel(s));
            onSelectionChange(newSelection, labels);
            return newSelection;
        });
    };

    const getSeatStatus = (seatNumber: number) => {
        if (bookedSeats.includes(seatNumber)) return 'booked';
        if (selectedSeats.includes(seatNumber)) return 'selected';
        return 'available';
    };

    const renderSeat = (seatNumber: number) => {
        const status = getSeatStatus(seatNumber);
        const label = getSeatLabel(seatNumber);

        return (
            <button
                key={seatNumber}
                onClick={() => toggleSeat(seatNumber)}
                disabled={status === 'booked'}
                className={`
                    relative w-14 h-14 rounded-lg transition-all duration-200 
                    flex flex-col items-center justify-center
                    ${status === 'booked' 
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

    // Layout per user's diagram:
    // Island A: Row 1 = RS1,RS2,RS3,RS4 | Row 2 = RS9,RS10,RS11,RS12
    // Island B: Row 1 = RS5,RS6,RS7,RS8 | Row 2 = RS13,RS14,RS15,RS16
    const leftIslandRow1 = [1, 2, 3, 4];
    const leftIslandRow2 = [9, 10, 11, 12];
    const rightIslandRow1 = [5, 6, 7, 8];
    const rightIslandRow2 = [13, 14, 15, 16];

    return (
        <div className="space-y-6">
            <div className="text-center">
                <h3 className="text-xl font-bold font-heading mb-1">Select Your Seats</h3>
                <p className="text-sm text-gray-400">
                    Click on available seats • {selectedSeats.length} selected
                </p>
            </div>

            {/* Racing Screen / Track View */}
            <div className="text-center">
                <div className="mx-auto w-4/5 h-6 bg-gradient-to-b from-neon/20 to-transparent rounded-t-full flex items-center justify-center border-t border-neon/30">
                    <span className="text-xs text-neon/70 font-heading uppercase tracking-widest">PCs</span>
                </div>
            </div>

            {/* Two Island Layout */}
            <div className="flex justify-center gap-8">
                {/* Left Island */}
                <div className="space-y-2">
                    <div className="text-center text-xs text-gray-500 mb-2">Island A</div>
                    <div className="grid grid-cols-4 gap-2">
                        {leftIslandRow1.map(renderSeat)}
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                        {leftIslandRow2.map(renderSeat)}
                    </div>
                </div>

                {/* Aisle */}
                <div className="flex flex-col items-center justify-center text-gray-600">
                    <div className="w-px h-full bg-white/10" />
                </div>

                {/* Right Island */}
                <div className="space-y-2">
                    <div className="text-center text-xs text-gray-500 mb-2">Island B</div>
                    <div className="grid grid-cols-4 gap-2">
                        {rightIslandRow1.map(renderSeat)}
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                        {rightIslandRow2.map(renderSeat)}
                    </div>
                </div>
            </div>

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
            </div>

            {/* Selection Summary */}
            {selectedSeats.length > 0 && (
                <div className="p-3 bg-neon/10 border border-neon/30 rounded-lg text-center">
                    <p className="text-sm text-neon font-medium">
                        {selectedSeats.length} seat{selectedSeats.length > 1 ? 's' : ''}: {' '}
                        {[...selectedSeats].sort((a, b) => a - b).map(s => getSeatLabel(s)).join(', ')}
                    </p>
                </div>
            )}
        </div>
    );
}
