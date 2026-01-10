'use client';

import { useState } from 'react';
import ServiceSelector from './ServiceSelector';
import DatePicker from './DatePicker';
import TimeSlotSelector from './TimeSlotSelector';
import SeatSelector from './SeatSelector';
import BookingSummary from './BookingSummary';
import { Booking } from '@/types';

interface FormData extends Partial<Booking> {
    service_name?: string;
    max_seats?: number;
}

export default function MultiStepForm() {
    const [currentStep, setCurrentStep] = useState(1);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [availableSeats, setAvailableSeats] = useState(0);
    const [formData, setFormData] = useState<FormData>({
        interface_type: 'form',
        seats_booked: 1
    });

    const updateFormData = (data: Partial<FormData>) => {
        setFormData({ ...formData, ...data });
    };

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
            <div className="max-w-2xl mx-auto p-8 text-center">
                <div className="text-6xl mb-6">Thank You!</div>
                <h2 className="text-3xl font-bold font-heading text-neon mb-4">Your booking has been confirmed!</h2>
                <p className="text-gray-400 mb-8">
                    A confirmation email has been sent to {formData.user_email}
                </p>
                <button
                    onClick={() => {
                        setIsSuccess(false);
                        setCurrentStep(1);
                        setFormData({ interface_type: 'form', seats_booked: 1 });
                    }}
                    className="px-6 py-3 bg-neon text-racing-dark font-bold rounded-lg hover:bg-white transition-colors"
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
                        onSelect={(serviceId, serviceName, totalSeats) =>
                            updateFormData({
                                service_id: serviceId,
                                service_name: serviceName,
                                max_seats: totalSeats
                            })
                        }
                    />
                )}

                {currentStep === 2 && (
                    <div>
                        <DatePicker
                            selected={formData.booking_date}
                            onSelect={(date) => updateFormData({
                                booking_date: date,
                                start_time: undefined,
                                end_time: undefined
                            })}
                        />
                        {formData.booking_date && formData.service_id && (
                            <TimeSlotSelector
                                serviceId={formData.service_id}
                                date={formData.booking_date}
                                selectedStart={formData.start_time}
                                onSelect={(start, end, seats) => {
                                    updateFormData({ start_time: start, end_time: end });
                                    setAvailableSeats(seats);
                                }}
                            />
                        )}
                    </div>
                )}

                {currentStep === 3 && (
                    <div className="space-y-8">
                        <SeatSelector
                            value={formData.seats_booked}
                            maxSeats={availableSeats}
                            serviceName={formData.service_name || 'this service'}
                            onChange={(seats) => updateFormData({ seats_booked: seats })}
                        />

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
            return !!data.seats_booked && data.seats_booked > 0 && !!data.user_name && !!data.user_email;
        default:
            return true;
    }
}
