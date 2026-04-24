import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAnalyticsSnapshot, type AnalyticsBookingRecord } from './snapshot';

const bookings: AnalyticsBookingRecord[] = [
    {
        booking_date: '2026-01-05',
        start_time: '12:00',
        seats_booked: 2,
        status: 'completed',
        services: { name: 'Racing Simulator' },
    },
    {
        booking_date: '2026-01-06',
        start_time: '14:00',
        seats_booked: 1,
        status: 'confirmed',
        services: { name: 'Playstation 5' },
    },
    {
        booking_date: '2026-01-06',
        start_time: '18:00',
        seats_booked: 3,
        status: 'completed',
        services: { name: 'Racing Simulator' },
    },
    {
        booking_date: '2026-01-08',
        start_time: '16:00',
        seats_booked: 1,
        status: 'cancelled',
        services: { name: 'Playstation 5' },
    },
];

test('buildAnalyticsSnapshot creates revenue datasets for interactive dashboards', () => {
    const snapshot = buildAnalyticsSnapshot(bookings, '2026-01-01', '2026-01-31');

    assert.deepEqual(snapshot.period, {
        start: '2026-01-01',
        end: '2026-01-31',
        label: '2026-01-01 to 2026-01-31',
    });

    assert.deepEqual(snapshot.revenueByDay, [
        { date: '2026-01-05', revenue: 30 },
        { date: '2026-01-06', revenue: 75 },
        { date: '2026-01-08', revenue: 0 },
    ]);

    assert.deepEqual(snapshot.revenueByService, [
        { label: 'Racing Simulator', revenue: 75, bookings: 2 },
        { label: 'Playstation 5', revenue: 30, bookings: 1 },
    ]);

    assert.equal(snapshot.topLevelCharts.revenueTrend.title, 'Revenue Over Time');
    assert.equal(snapshot.topLevelCharts.revenueTrend.format, 'currency');
    assert.equal(snapshot.topLevelCharts.revenueTrend.series[0].key, 'revenue');
    assert.equal(snapshot.topLevelCharts.revenueShare.type, 'pie');
    assert.equal(snapshot.topLevelCharts.weekdayDemand.title, 'Bookings by Day of Week');
    assert.equal(snapshot.topLevelCharts.hourlyDemand.title, 'Bookings by Hour');
    assert.equal(snapshot.topLevelCharts.statusBreakdown.type, 'pie');
    assert.deepEqual(snapshot.topLevelCharts.weekdayDemand.data, snapshot.bookingsByDay);
    assert.deepEqual(snapshot.topLevelCharts.hourlyDemand.data, snapshot.bookingsByHour);
    assert.deepEqual(snapshot.topLevelCharts.statusBreakdown.data, snapshot.statusCounts);
});
