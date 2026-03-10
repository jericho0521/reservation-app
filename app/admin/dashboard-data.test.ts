import assert from 'node:assert/strict';
import test from 'node:test';
import { filterBookings, getBookingSummary, type AdminBooking } from './dashboard-data';

const bookings: AdminBooking[] = [
    {
        id: '1',
        user_name: 'A',
        user_email: 'a@example.com',
        booking_date: '2026-03-11',
        start_time: '12:00',
        end_time: '13:00',
        seats_booked: 2,
        status: 'confirmed',
        services: { name: 'Racing Simulator' },
    },
    {
        id: '2',
        user_name: 'B',
        user_email: 'b@example.com',
        booking_date: '2026-03-12',
        start_time: '14:00',
        end_time: '15:00',
        seats_booked: 1,
        status: 'completed',
        services: { name: 'Playstation 5' },
    },
    {
        id: '3',
        user_name: 'C',
        user_email: 'c@example.com',
        booking_date: '2026-03-10',
        start_time: '18:00',
        end_time: '19:00',
        seats_booked: 4,
        status: 'cancelled',
        services: { name: 'Racing Simulator' },
    },
    {
        id: '4',
        user_name: 'D',
        user_email: 'd@example.com',
        booking_date: '2026-03-13',
        start_time: '20:00',
        end_time: '21:00',
        seats_booked: 3,
        status: 'pending',
        services: { name: 'Racing Simulator' },
    },
];

test('getBookingSummary counts status buckets once', () => {
    assert.deepEqual(getBookingSummary(bookings), {
        confirmed: 1,
        completed: 1,
        cancelled: 1,
    });
});

test('filterBookings applies admin filters deterministically', () => {
    assert.deepEqual(
        filterBookings(bookings, 'all', '2026-03-11').map(booking => booking.id),
        ['1', '4'],
    );

    assert.deepEqual(
        filterBookings(bookings, 'today', '2026-03-11').map(booking => booking.id),
        ['1'],
    );

    assert.deepEqual(
        filterBookings(bookings, 'upcoming', '2026-03-11').map(booking => booking.id),
        ['1'],
    );

    assert.deepEqual(
        filterBookings(bookings, 'completed', '2026-03-11').map(booking => booking.id),
        ['2'],
    );

    assert.deepEqual(
        filterBookings(bookings, 'cancelled', '2026-03-11').map(booking => booking.id),
        ['3'],
    );
});
