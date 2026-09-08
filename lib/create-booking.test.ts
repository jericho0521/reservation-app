import assert from 'node:assert/strict';
import test from 'node:test';
import {
    BookingCreationError,
    validateBookingSchedule,
    validateSeatSelection,
    type BookableService,
} from './create-booking';
import { walkInBookingRequestSchema, type CreateBookingInput } from './booking-schema';

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

test('walk-in racing bookings must name the seats so they are actually blocked', () => {
    assert.throws(
        () => validateSeatSelection(racingService, { ...booking, interface_type: 'walk_in' }),
        (error: unknown) => (
            error instanceof BookingCreationError &&
            error.message === 'Selected seat labels must match booked seats'
        ),
    );
    assert.doesNotThrow(() => validateSeatSelection(racingService, {
        ...booking,
        interface_type: 'walk_in',
        seat_labels: ['RS1', 'RS2'],
    }));
});

test('walk-ins may be booked into the hour that has already started', () => {
    // 14:30 Malaysia time on the booking date.
    const now = new Date('2026-08-03T06:30:00Z');
    const startedSlot = { ...booking, start_time: '14:00', end_time: '15:00', interface_type: 'walk_in' as const };

    assert.throws(
        () => validateBookingSchedule(startedSlot, { now }),
        (error: unknown) => error instanceof BookingCreationError && error.status === 409,
    );
    assert.doesNotThrow(() => validateBookingSchedule(startedSlot, { now, allowStartedSlot: true }));
});

test('walk-in requests only require a customer name', () => {
    const parsed = walkInBookingRequestSchema.parse({
        service_id: racingService.id,
        user_name: 'Walk-in Guest',
        user_email: '',
        user_phone: '',
        booking_date: '2026-08-03',
        start_time: '14:00',
        end_time: '15:00',
        seats_booked: 1,
        seat_labels: ['RS3'],
    });

    assert.equal(parsed.interface_type, 'walk_in');
    assert.equal(parsed.user_email, '');
    assert.equal(parsed.user_phone, undefined);

    assert.throws(() => walkInBookingRequestSchema.parse({
        service_id: racingService.id,
        user_name: 'Walk-in Guest',
        user_email: 'not-an-email',
        booking_date: '2026-08-03',
        start_time: '14:00',
        end_time: '15:00',
        seats_booked: 1,
    }));
});

test('walk-in exception cannot book an earlier elapsed hour', () => {
  assert.throws(() => validateBookingSchedule({ ...booking, start_time: '12:00', end_time: '15:00' }, {
    now: new Date('2026-08-03T06:30:00Z'), allowStartedSlot: true,
  }), BookingCreationError);
});
test('unnumbered services reject explicit racing seat labels', () => {
  assert.throws(() => validateSeatSelection({ ...racingService, total_seats: 2 }, {
    ...booking, seats_booked: 1, seat_labels: ['RS1', 'RS2'],
  }), BookingCreationError);
});
test('chat explicit seat labels must match the reserved count', () => {
  assert.throws(() => validateSeatSelection(racingService, { ...booking, seats_booked: 1, seat_labels: ['RS1', 'RS2'] }), BookingCreationError);
});
