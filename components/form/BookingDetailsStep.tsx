'use client';

import SeatMap from './SeatMap';
import type { BookingDetailErrors, BookingDetailField } from './booking-validation';

interface BookingDetailsStepProps {
    serviceName?: string;
    isRacingSimulator: boolean;
    availabilityKey: string;
    availableSeats: number;
    takenSeatLabels: string[];
    maintenanceSeatLabels: string[];
    seatsBooked?: number;
    userName?: string;
    userEmail?: string;
    userPhone?: string;
    errors: BookingDetailErrors;
    onSeatSelectionChange: (seats: number[], labels: string[]) => void;
    onChange: (
        field: 'seats_booked' | 'user_name' | 'user_email' | 'user_phone',
        value: number | string,
    ) => void;
    onClearError: (field: BookingDetailField) => void;
}

export default function BookingDetailsStep({
    serviceName,
    isRacingSimulator,
    availabilityKey,
    availableSeats,
    takenSeatLabels,
    maintenanceSeatLabels,
    seatsBooked,
    userName,
    userEmail,
    userPhone,
    errors,
    onSeatSelectionChange,
    onChange,
    onClearError,
}: BookingDetailsStepProps) {
    return (
        <div className="space-y-8">
            {isRacingSimulator ? (
                <div>
                    <SeatMap
                        key={availabilityKey}
                        totalSeats={16}
                        maxAvailable={availableSeats}
                        takenSeatLabels={takenSeatLabels}
                        maintenanceSeatLabels={maintenanceSeatLabels}
                        onSelectionChange={onSeatSelectionChange}
                    />
                    <FieldError message={errors.seats_booked} />
                </div>
            ) : (
                <div className="space-y-4">
                    <h3 className="text-xl font-bold font-heading">Number of Seats</h3>
                    <p className="text-sm text-gray-400">
                        How many seats would you like to book for {serviceName}?
                    </p>
                    <div className="max-w-xs">
                        <input
                            type="number"
                            min={1}
                            max={availableSeats}
                            value={seatsBooked || ''}
                            onChange={(event) => {
                                const requestedSeats = Number.parseInt(event.target.value, 10) || 0;
                                onChange('seats_booked', Math.min(Math.max(requestedSeats, 0), availableSeats));
                                onClearError('seats_booked');
                            }}
                            placeholder="Enter number of seats"
                            className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white focus:border-neon focus:outline-none focus:ring-1 focus:ring-neon transition-colors text-lg"
                        />
                        <p className="text-sm text-neon mt-2">
                            Maximum available for the entire selected time: {availableSeats} seats
                        </p>
                        <FieldError message={errors.seats_booked} />
                    </div>
                </div>
            )}

            <div className="space-y-4">
                <h3 className="text-xl font-bold font-heading">Your Information</h3>
                <ContactField
                    label="Full Name"
                    type="text"
                    value={userName}
                    placeholder="John Doe"
                    error={errors.user_name}
                    onChange={value => {
                        onChange('user_name', value);
                        onClearError('user_name');
                    }}
                />
                <ContactField
                    label="Email Address"
                    type="email"
                    value={userEmail}
                    placeholder="john@example.com"
                    error={errors.user_email}
                    onChange={value => {
                        onChange('user_email', value);
                        onClearError('user_email');
                    }}
                />
                <ContactField
                    label="Phone Number"
                    type="tel"
                    value={userPhone}
                    placeholder="+60 12-345 6789"
                    error={errors.user_phone}
                    onChange={value => {
                        onChange('user_phone', value);
                        onClearError('user_phone');
                    }}
                />
            </div>
        </div>
    );
}

function ContactField({
    label,
    type,
    value,
    placeholder,
    error,
    onChange,
}: {
    label: string;
    type: 'text' | 'email' | 'tel';
    value?: string;
    placeholder: string;
    error?: string;
    onChange: (value: string) => void;
}) {
    return (
        <div>
            <label className="block text-sm text-gray-400 mb-2">{label}</label>
            <input
                type={type}
                value={value || ''}
                onChange={event => onChange(event.target.value)}
                aria-invalid={Boolean(error)}
                placeholder={placeholder}
                className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white focus:border-neon focus:outline-none focus:ring-1 focus:ring-neon transition-colors"
            />
            <FieldError message={error} />
        </div>
    );
}

function FieldError({ message }: { message?: string }) {
    return message ? <p className="mt-2 text-sm text-red-400">{message}</p> : null;
}
