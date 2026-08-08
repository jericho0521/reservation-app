'use client';

import { useCallback, useState } from 'react';
import dynamic from 'next/dynamic';
import ServiceSelector from './ServiceSelector';
import DatePicker from './DatePicker';
import TimeSlotSelector from './TimeSlotSelector';
import BookingDetailsStep from './BookingDetailsStep';
import BookingSummary from './BookingSummary';
import type { Booking, TimeRangeSelection } from '@/types';
import {
    BookingDetailErrors,
    BookingDetailField,
    validateBookingDetails,
} from './booking-validation';

const ConfettiExplosion = dynamic(() => import('../ui/ConfettiExplosion'), {
    ssr: false,
});

const BookingTicket = dynamic(() => import('../ui/BookingTicket'));

interface FormData extends Partial<Booking> {
    service_name?: string;
    max_seats?: number;
    selected_seat_labels?: string[];
}

interface BookingConfirmation {
    bookingId?: string;
    emailSent: boolean;
}

interface AvailabilitySelection {
    availableSeats: number;
    takenSeatLabels: string[];
    maintenanceSeatLabels: string[];
}

const EMPTY_AVAILABILITY: AvailabilitySelection = {
    availableSeats: 0,
    takenSeatLabels: [],
    maintenanceSeatLabels: [],
};

export default function MultiStepForm() {
    const [currentStep, setCurrentStep] = useState(1);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submissionError, setSubmissionError] = useState('');
    const [detailErrors, setDetailErrors] = useState<BookingDetailErrors>({});
    const [confirmation, setConfirmation] = useState<BookingConfirmation | null>(null);
    const [availability, setAvailability] = useState<AvailabilitySelection>(EMPTY_AVAILABILITY);
    const [formData, setFormData] = useState<FormData>(() => ({
        seats_booked: 1,
    }));

    const updateFormData = (data: Partial<FormData>) => {
        setFormData(prev => ({ ...prev, ...data }));
        setSubmissionError('');
    };

    const clearDetailError = (field: BookingDetailField) => {
        setDetailErrors(prev => ({ ...prev, [field]: undefined }));
    };

    const handleSeatSelectionChange = useCallback((seats: number[], labels: string[]) => {
        setFormData(prev => ({
            ...prev,
            seats_booked: seats.length,
            selected_seat_labels: labels,
        }));
        setDetailErrors(prev => ({ ...prev, seats_booked: undefined }));
    }, []);

    const handleTimeSelectionUnavailable = useCallback(() => {
        setFormData(prev => ({
            ...prev,
            start_time: undefined,
            end_time: undefined,
            selected_seat_labels: undefined,
            seats_booked: getInitialSeatCount(prev.max_seats),
        }));
        setAvailability(EMPTY_AVAILABILITY);
        setSubmissionError('Your selected time is no longer available. Please choose another time.');
    }, []);

    const handleTimeSelection = useCallback((selection: TimeRangeSelection) => {
        setFormData(prev => ({
            ...prev,
            start_time: selection.startTime,
            end_time: selection.endTime,
            selected_seat_labels: undefined,
            seats_booked: getInitialSeatCount(prev.max_seats),
        }));
        setAvailability({
            availableSeats: selection.availableSeats,
            takenSeatLabels: selection.takenSeatLabels,
            maintenanceSeatLabels: selection.maintenanceSeatLabels,
        });
        setSubmissionError('');
    }, []);

    const nextStep = () => setCurrentStep(prev => prev + 1);
    const prevStep = () => {
        setSubmissionError('');
        setCurrentStep(prev => prev - 1);
    };

    const handleDetailsNext = () => {
        const errors = getBookingDetailErrors(formData);
        setDetailErrors(errors);

        if (Object.keys(errors).length === 0) {
            nextStep();
        }
    };

    const handleSubmit = async () => {
        const errors = getBookingDetailErrors(formData);
        if (Object.keys(errors).length > 0 || !isStepValid(2, formData)) {
            setDetailErrors(errors);
            setSubmissionError('Please go back and correct the highlighted booking details.');
            return;
        }

        setSubmissionError('');
        setIsSubmitting(true);
        try {
            const response = await fetch('/api/bookings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    service_id: formData.service_id,
                    user_name: formData.user_name,
                    user_email: formData.user_email,
                    user_phone: formData.user_phone,
                    booking_date: formData.booking_date,
                    start_time: formData.start_time,
                    end_time: formData.end_time,
                    seats_booked: formData.seats_booked,
                    seat_labels: formData.selected_seat_labels || [],
                    interface_type: 'form',
                }),
            });

            if (response.ok) {
                const booking = await response.json();
                setConfirmation({
                    bookingId: typeof booking.id === 'string' ? booking.id : undefined,
                    emailSent: booking.email_sent === true,
                });
            } else {
                const error = await response.json().catch(() => null);
                setSubmissionError(error?.error || 'Booking failed. Please try again.');
            }
        } catch (error) {
            console.error('Booking failed:', error);
            setSubmissionError('Unable to reach the booking service. Check your connection and try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (confirmation) {
        return (
            <div className="relative min-h-[80vh] flex flex-col items-center justify-center p-8">
                {/* Confetti Animation */}
                <ConfettiExplosion />

                {/* Animated Booking Ticket */}
                <BookingTicket
                    service={formData.service_name || 'Racing Simulator'}
                    date={formData.booking_date || ''}
                    time={formData.start_time && formData.end_time
                        ? `${formData.start_time} - ${formData.end_time}`
                        : formData.start_time || ''}
                    seats={formData.seats_booked || 1}
                    name={formData.user_name || ''}
                    email={formData.user_email || ''}
                    phone={formData.user_phone || ''}
                    bookingId={confirmation.bookingId}
                    emailSent={confirmation.emailSent}
                />

                {/* Make Another Booking Button */}
                <button
                    onClick={() => {
                        setConfirmation(null);
                        setSubmissionError('');
                        setDetailErrors({});
                        setCurrentStep(1);
                        setAvailability(EMPTY_AVAILABILITY);
                        setFormData({ seats_booked: 1 });
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
                            setAvailability(EMPTY_AVAILABILITY);
                            updateFormData({
                                service_id: serviceId,
                                service_name: serviceName,
                                max_seats: totalSeats,
                                start_time: undefined,
                                end_time: undefined,
                                selected_seat_labels: undefined,
                                seats_booked: getInitialSeatCount(totalSeats),
                            });
                        }}
                    />
                )}

                {currentStep === 2 && (
                    <div>
                        <DatePicker
                            selected={formData.booking_date}
                            onSelect={(date) => {
                                setAvailability(EMPTY_AVAILABILITY);
                                updateFormData({
                                    booking_date: date,
                                    start_time: undefined,
                                    end_time: undefined,
                                    selected_seat_labels: undefined,
                                    seats_booked: getInitialSeatCount(formData.max_seats),
                                });
                            }}
                        />
                        {formData.booking_date && formData.service_id && (
                            <TimeSlotSelector
                                key={`${formData.service_id}-${formData.booking_date}`}
                                serviceId={formData.service_id}
                                date={formData.booking_date}
                                selectedStart={formData.start_time}
                                selectedEnd={formData.end_time}
                                onSelectionUnavailable={handleTimeSelectionUnavailable}
                                onSelect={handleTimeSelection}
                            />
                        )}
                    </div>
                )}

                {currentStep === 3 && (
                    <BookingDetailsStep
                        serviceName={formData.service_name}
                        isRacingSimulator={formData.max_seats === 16}
                        availabilityKey={`${formData.service_id}-${formData.booking_date}-${formData.start_time}-${formData.end_time}`}
                        availableSeats={availability.availableSeats}
                        takenSeatLabels={availability.takenSeatLabels}
                        maintenanceSeatLabels={availability.maintenanceSeatLabels}
                        seatsBooked={formData.seats_booked}
                        userName={formData.user_name}
                        userEmail={formData.user_email}
                        userPhone={formData.user_phone}
                        errors={detailErrors}
                        onSeatSelectionChange={handleSeatSelectionChange}
                        onChange={(field, value) => updateFormData({ [field]: value })}
                        onClearError={clearDetailError}
                    />
                )}

                {currentStep === 4 && <BookingSummary booking={formData} />}
            </div>

            {submissionError && (
                <div role="alert" className="mt-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                    {submissionError}
                </div>
            )}

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
                        onClick={currentStep === 3 ? handleDetailsNext : nextStep}
                        disabled={currentStep !== 3 && !isStepValid(currentStep, formData)}
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

function getInitialSeatCount(totalSeats?: number): number {
    return totalSeats === 16 ? 0 : 1;
}

function getBookingDetailErrors(
    data: Partial<FormData>,
): BookingDetailErrors {
    return validateBookingDetails({
        user_name: data.user_name,
        user_email: data.user_email,
        user_phone: data.user_phone,
        seats_booked: data.seats_booked,
        selected_seat_labels: data.selected_seat_labels,
        requiresSeatSelection: data.max_seats === 16,
    });
}

function isStepValid(step: number, data: Partial<FormData>): boolean {
    switch (step) {
        case 1:
            return !!data.service_id;
        case 2:
            return !!data.booking_date && !!data.start_time && !!data.end_time;
        case 3:
            return Object.keys(getBookingDetailErrors(data)).length === 0;
        default:
            return true;
    }
}
