import assert from 'node:assert/strict';
import test from 'node:test';
import {
    filterBookings,
    filterBookingsForBoard,
    filterBookingsForTable,
    formatRefreshTime,
    getAdminBookingsLoadError,
    getBookingSummary,
    getStatusForLane,
    groupBookingsByLane,
    shiftDate,
    type AdminBooking,
} from './dashboard-data';

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
        interface_type: 'form',
        created_at: '2026-03-11T04:00:00.000Z',
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
        interface_type: 'chat',
        created_at: '2026-03-11T03:00:00.000Z',
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
        interface_type: 'form',
        created_at: '2026-03-11T02:00:00.000Z',
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
        status: 'in_progress',
        interface_type: 'chat',
        created_at: '2026-03-11T01:00:00.000Z',
        services: { name: 'Racing Simulator' },
    },
];

test('getBookingSummary counts status buckets once', () => {
    assert.deepEqual(getBookingSummary(bookings), {
        confirmed: 1,
        inProgress: 1,
        completed: 1,
        cancelled: 1,
    });
});

test('filterBookings applies admin filters deterministically', () => {
    assert.deepEqual(
        filterBookings(bookings, 'all', '2026-03-11').map(booking => booking.id),
        ['1', '2', '3', '4'],
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

test('formatRefreshTime renders a stable placeholder before client hydration', () => {
    assert.equal(formatRefreshTime(null), 'Updated just now');
});

test('filterBookingsForBoard keeps the selected day and applies search and service filters', () => {
    assert.deepEqual(
        filterBookingsForBoard(bookings, {
            date: '2026-03-11',
            search: 'a@example',
            service: 'Racing Simulator',
        }).map(booking => booking.id),
        ['1'],
    );
});

test('groupBookingsByLane maps database statuses to the four workflow lanes', () => {
    const grouped = groupBookingsByLane(bookings);

    assert.deepEqual(grouped.upcoming.map(booking => booking.id), ['1']);
    assert.deepEqual(grouped.in_progress.map(booking => booking.id), ['4']);
    assert.deepEqual(grouped.done.map(booking => booking.id), ['2']);
    assert.deepEqual(grouped.cancelled.map(booking => booking.id), ['3']);
    assert.equal(getStatusForLane('done'), 'completed');
});

test('shiftDate performs timezone-independent date navigation', () => {
    assert.equal(shiftDate('2026-03-31', 1), '2026-04-01');
    assert.equal(shiftDate('2026-03-01', -1), '2026-02-28');
});

test('filterBookingsForTable combines status and date-range filters', () => {
    assert.deepEqual(
        filterBookingsForTable(bookings, {
            search: '',
            service: 'all',
            status: 'completed',
            dateFrom: '2026-03-11',
            dateTo: '2026-03-13',
        }).map(booking => booking.id),
        ['2'],
    );
});

test('formatRefreshTime formats the client refresh timestamp after hydration', () => {
    assert.equal(
        formatRefreshTime(new Date('2026-03-11T05:12:43.000Z'), 'en-MY', 'UTC'),
        'Updated 5:12:43 am',
    );
});

test('getAdminBookingsLoadError surfaces booking query failures first', () => {
    assert.equal(
        getAdminBookingsLoadError(
            { message: 'Could not find a relationship between bookings and services' },
            { message: 'permission denied' },
        ),
        'Could not find a relationship between bookings and services',
    );
});

test('getAdminBookingsLoadError falls back to today count failures', () => {
    assert.equal(
        getAdminBookingsLoadError(null, { message: 'permission denied for table bookings' }),
        'permission denied for table bookings',
    );
});
