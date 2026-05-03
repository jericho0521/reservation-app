'use client';

import { useCallback, useState } from 'react';
import dynamic from 'next/dynamic';
import ServiceSelector from './ServiceSelector';
import DatePicker from './DatePicker';
import TimeSlotSelector from './TimeSlotSelector';
import SeatMap from './SeatMap';
import BookingSummary from './BookingSummary';
import { Booking } from '@/types';

const ConfettiExplosion = dynamic(() => import('../ui/ConfettiExplosion'), {
    ssr: false,
});

const BookingTicket = dynamic(() => import('../ui/BookingTicket'));

interface FormData extends Partial<Booking> {
    service_name?: string;
    max_seats?: number;
    selected_seat_labels?: string[];
}

export default function MultiStepForm() {
    const [currentStep, setCurrentStep] = useState(1);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [availableSeats, setAvailableSeats] = useState(0);
    const [takenSeatLabels, setTakenSeatLabels] = useState<string[]>([]);
    const [formData, setFormData] = useState<FormData>(() => ({
        interface_type: 'form',
        seats_booked: 1
    }));

    const updateFormData = (data: Partial<FormData>) => {
        setFormData(prev => ({ ...prev, ...data }));
    };

    const handleSeatSelectionChange = useCallback((seats: number[], labels: string[]) => {
        setFormData(prev => ({
            ...prev,
            seats_booked: seats.length,
            selected_seat_labels: labels,
        }));
    }, []);

    const nextStep = () => setCurrentStep(prev => prev + 1);
    const prevStep = () => setCurrentStep(prev => prev - 1);

    const handleSubmit = async () => {
        setIsSubmitting(true);
        try {
            const response = await fetch('/api/bookings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    service_id: formData.service_id,
                    user_name: formData.user_name,
                    user_email: formData.user_email,
                    booking_date: formData.booking_date,
                    start_time: formData.start_time,
                    end_time: formData.end_time,
                    seats_booked: formData.seats_booked,
                    seat_labels: formData.selected_seat_labels || [],
                    interface_type: formData.interface_type
                })
            });

            if (response.ok) {
                setIsSuccess(true);
            } else {
                const error = await response.json();
                alert(error.error || 'Booking failed. Please try again.');
            }
        } catch (error) {
            console.error('Booking failed:', error);
            alert('Booking failed. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isSuccess) {
        return (
            <div className="relative min-h-[80vh] flex flex-col items-center justify-center p-8">
                {/* Confetti Animation */}
                <ConfettiExplosion />

                {/* Animated Booking Ticket */}
                <BookingTicket
                    service={formData.service_name || 'Racing Simulator'}
                    date={formData.booking_date || ''}
                    time={formData.start_time || ''}
                    seats={formData.seats_booked || 1}
                    name={formData.user_name || ''}
                    email={formData.user_email || ''}
                />

                {/* Make Another Booking Button */}
                <button
                    onClick={() => {
                        setIsSuccess(false);
                        setCurrentStep(1);
                        setAvailableSeats(0);
                        setFormData({ interface_type: 'form', seats_booked: 1 });
                    }}
                    className="mt-8 px-6 py-3 bg-white/10 border border-white/20 text-white font-bold rounded-lg hover:bg-white/20 hover:border-neon transition-all"
                >
                    Make Another Booking
                </button>
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto p-6">
            {/* Progress Indicator */}
            <div className="mb-10">
                <div className="flex justify-between mb-2">
                    {['Service', 'Date & Time', 'Details', 'Review'].map((label, index) => (
                        <div
                            key={label}
                            className={`flex-1 h-2 mx-1 rounded-full transition-colors ${index + 1 <= currentStep ? 'bg-neon' : 'bg-white/20'
                                }`}
                        />
                    ))}
                </div>
                <div className="flex justify-between text-sm text-gray-400">
                    <span className={currentStep >= 1 ? 'text-neon' : ''}>Service</span>
                    <span className={currentStep >= 2 ? 'text-neon' : ''}>Date & Time</span>
                    <span className={currentStep >= 3 ? 'text-neon' : ''}>Details</span>
                    <span className={currentStep >= 4 ? 'text-neon' : ''}>Review</span>
                </div>
            </div>

            {/* Step Content */}
            <div className="min-h-[400px]">
                {currentStep === 1 && (
                    <ServiceSelector
                        selected={formData.service_id}
                        onSelect={(serviceId, serviceName, totalSeats) => {
                            setAvailableSeats(0);
                            setTakenSeatLabels([]);
                            updateFormData({
                                service_id: serviceId,
                                service_name: serviceName,
                                max_seats: totalSeats,
                                start_time: undefined,
                                end_time: undefined,
                                selected_seat_labels: undefined,
                                seats_booked: totalSeats === 16 ? 0 : 1,
                            });
                        }}
                    />
                )}

                {currentStep === 2 && (
                    <div>
                        <DatePicker
                            selected={formData.booking_date}
                            onSelect={(date) => {
                                setAvailableSeats(0);
                                setTakenSeatLabels([]);
                                updateFormData({
                                    booking_date: date,
                                    start_time: undefined,
                                    end_time: undefined,
                                    selected_seat_labels: undefined,
                                    seats_booked: formData.max_seats === 16 ? 0 : 1,
                                });
                            }}
                        />
                        {formData.booking_date && formData.service_id && (
                            <TimeSlotSelector
                                serviceId={formData.service_id}
                                date={formData.booking_date}
                                selectedStart={formData.start_time}
                                onSelect={(start, end, seats, labels) => {
                                    updateFormData({
                                        start_time: start,
                                        end_time: end,
                                        selected_seat_labels: undefined,
                                        seats_booked: formData.max_seats === 16 ? 0 : 1,
                                    });
                                    setAvailableSeats(seats);
                                    setTakenSeatLabels(labels);
                                }}
                            />
                        )}
                    </div>
                )}

                {currentStep === 3 && (
                    <div className="space-y-8">
                        {/* Only show SeatMap for Racing Simulator (16 seats) */}
                        {formData.max_seats === 16 ? (
                            <SeatMap
                                key={`${formData.service_id}-${formData.booking_date}-${formData.start_time}`}
                                totalSeats={16}
                                maxAvailable={availableSeats}
                                takenSeatLabels={takenSeatLabels}
                                onSelectionChange={handleSeatSelectionChange}
                            />
                        ) : (
                            /* Simple seat count for PS5 (2 seats) */
                            <div className="space-y-4">
                                <h3 className="text-xl font-bold font-heading">Number of Seats</h3>
                                <p className="text-sm text-gray-400">
                                    How many seats would you like to book for {formData.service_name}?
                                </p>
                                <div className="max-w-xs">
                                    <input
                                        type="number"
                                        min={1}
                                        max={availableSeats}
                                        value={formData.seats_booked || ''}
                                        onChange={(e) => {
                                            const val = parseInt(e.target.value) || 0;
                                            updateFormData({ seats_booked: Math.min(val, availableSeats) });
                                        }}
                                        placeholder="Enter number of seats"
                                        className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white focus:border-neon focus:outline-none focus:ring-1 focus:ring-neon transition-colors text-lg"
                                    />
                                    <p className="text-sm text-neon mt-2">
                                        Maximum available: {availableSeats} seats
                                    </p>
                                </div>
                            </div>
                        )}

                        <div className="space-y-4">
                            <h3 className="text-xl font-bold font-heading">Your Information</h3>
                            <div>
                                <label className="block text-sm text-gray-400 mb-2">Full Name</label>
                                <input
                                    type="text"
                                    value={formData.user_name || ''}
                                    onChange={(e) => updateFormData({ user_name: e.target.value })}
                                    placeholder="John Doe"
                                    className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white focus:border-neon focus:outline-none focus:ring-1 focus:ring-neon transition-colors"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-2">Email Address</label>
                                <input
                                    type="email"
                                    value={formData.user_email || ''}
                                    onChange={(e) => updateFormData({ user_email: e.target.value })}
                                    placeholder="john@example.com"
                                    className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white focus:border-neon focus:outline-none focus:ring-1 focus:ring-neon transition-colors"
                                />
                            </div>
                        </div>
                    </div>
                )}

                {currentStep === 4 && <BookingSummary booking={formData} />}
            </div>

            {/* Navigation Buttons */}
            <div className="flex justify-between mt-10 pt-6 border-t border-white/10">
                {currentStep > 1 ? (
                    <button
                        onClick={prevStep}
                        className="px-6 py-3 border border-white/20 rounded-lg hover:border-neon hover:text-neon transition-colors"
                    >
                        Back
                    </button>
                ) : (
                    <div />
                )}

                {currentStep < 4 ? (
                    <button
                        onClick={nextStep}
                        disabled={!isStepValid(currentStep, formData)}
                        className="px-8 py-3 bg-neon text-racing-dark font-bold rounded-lg hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Next
                    </button>
                ) : (
                    <button
                        onClick={handleSubmit}
                        disabled={isSubmitting}
                        className="px-8 py-3 bg-neon text-racing-dark font-bold rounded-lg hover:bg-white transition-colors disabled:opacity-50"
                    >
                        {isSubmitting ? 'Booking...' : 'Confirm Booking'}
                    </button>
                )}
            </div>
        </div>
    );
}

function isStepValid(step: number, data: Partial<FormData>): boolean {
    switch (step) {
        case 1:
            return !!data.service_id;
        case 2:
            return !!data.booking_date && !!data.start_time && !!data.end_time;
        case 3:
            if (data.max_seats === 16) {
                const selectedLabels = data.selected_seat_labels ?? [];

                return (
                    selectedLabels.length > 0 &&
                    data.seats_booked === selectedLabels.length &&
                    !!data.user_name &&
                    !!data.user_email
                );
            }

            return !!data.seats_booked && data.seats_booked > 0 && !!data.user_name && !!data.user_email;
        default:
            return true;
    }
}
