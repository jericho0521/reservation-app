import assert from 'node:assert/strict';
import test from 'node:test';
import {
    BookingCreationError,
    validateSeatSelection,
    type BookableService,
} from './create-booking';
import type { CreateBookingInput } from './booking-schema';

const racingService: BookableService = {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Racing Simulator',
    total_seats: 16,
};

const booking: CreateBookingInput = {
    user_name: 'Alex Tan',
    user_email: 'alex@example.com',
    user_phone: '+60 12-345 6789',
    booking_date: '2026-08-03',
    start_time: '14:00',
    end_time: '16:00',
    seats_booked: 2,
    interface_type: 'chat',
};

test('chat racing bookings may reserve capacity without choosing seat labels', () => {
    assert.doesNotThrow(() => validateSeatSelection(racingService, booking));
});

test('form racing bookings require one label for every booked seat', () => {
    assert.throws(
        () => validateSeatSelection(racingService, { ...booking, interface_type: 'form' }),
        (error: unknown) => (
            error instanceof BookingCreationError &&
            error.message === 'Selected seat labels must match booked seats'
        ),
    );
});
