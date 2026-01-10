'use client';

interface Props {
    value?: number;
    maxSeats: number;
    serviceName: string;
    onChange: (seats: number) => void;
}

export default function SeatSelector({ value, maxSeats, serviceName, onChange }: Props) {
    return (
        <div className="space-y-4">
            <h3 className="text-xl font-bold font-heading">Number of Seats</h3>
            <p className="text-sm text-gray-400">
                How many seats would you like to book for {serviceName}?
            </p>
            <div className="max-w-xs">
                <input
                    type="number"
                    min={1}
                    max={maxSeats}
                    value={value || ''}
                    onChange={(e) => {
                        const val = parseInt(e.target.value) || 0;
                        onChange(Math.min(val, maxSeats));
                    }}
                    placeholder="Enter number of seats"
                    className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white focus:border-neon focus:outline-none focus:ring-1 focus:ring-neon transition-colors text-lg"
                />
                <p className="text-sm text-neon mt-2">
                    Maximum available: {maxSeats} seats
                </p>
            </div>
        </div>
    );
}
