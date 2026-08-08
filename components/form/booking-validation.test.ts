import assert from 'node:assert/strict';
import test from 'node:test';
import { validateBookingDetails } from './booking-validation';

test('validateBookingDetails reports invalid contact and seat details', () => {
    assert.deepEqual(validateBookingDetails({
        user_name: ' ',
        user_email: 'not-an-email',
        user_phone: '123',
        seats_booked: 0,
        selected_seat_labels: [],
        requiresSeatSelection: true,
    }), {
        user_name: 'Enter your full name.',
        user_email: 'Enter a valid email address.',
        user_phone: 'Enter a valid phone number with 7 to 15 digits.',
        seats_booked: 'Select at least one seat.',
    });
});

test('validateBookingDetails accepts international contact details and matching seats', () => {
    assert.deepEqual(validateBookingDetails({
        user_name: 'Alex Tan',
        user_email: 'alex@example.com',
        user_phone: '+60 12-345 6789',
        seats_booked: 2,
        selected_seat_labels: ['RS1', 'RS2'],
        requiresSeatSelection: true,
    }), {});
});
