import assert from 'node:assert/strict';
import test from 'node:test';
import {
    getEndTime,
    getMalaysiaDateString,
    getSlotTimesInRange,
    isBookingDateWithinWindow,
    isBookingSlotElapsed,
    isValidBookingTimeRange,
} from './booking-schedule';

test('getMalaysiaDateString returns the Malaysia local date', () => {
    assert.equal(
        getMalaysiaDateString(new Date('2026-04-22T16:30:00.000Z')),
        '2026-04-23',
    );
});

test('booking time validation accepts only contiguous ranges within operating hours', () => {
    assert.deepEqual(getSlotTimesInRange('22:00', '01:00'), ['22:00', '23:00', '00:00']);
    assert.equal(isValidBookingTimeRange('14:00', '16:00'), true);
    assert.equal(isValidBookingTimeRange('23:00', '01:00'), true);
    assert.equal(isValidBookingTimeRange('11:00', '13:00'), false);
    assert.equal(isValidBookingTimeRange('14:30', '16:30'), false);
    assert.equal(isValidBookingTimeRange('16:00', '14:00'), false);
});

test('booking date and elapsed-slot validation use Malaysia time', () => {
    const now = new Date('2026-08-03T06:30:00.000Z'); // 14:30 in Malaysia

    assert.equal(isBookingDateWithinWindow('2026-08-02', now), false);
    assert.equal(isBookingDateWithinWindow('2026-08-03', now), true);
    assert.equal(isBookingDateWithinWindow('2026-09-03', now), false);
    assert.equal(isBookingSlotElapsed('2026-08-03', '14:00', now), true);
    assert.equal(isBookingSlotElapsed('2026-08-03', '15:00', now), false);
});

test('after-midnight slots remain attached to the operating date that began at noon', () => {
    const now = new Date('2026-08-03T16:30:00.000Z'); // 00:30 on August 4 in Malaysia

    assert.equal(isBookingDateWithinWindow('2026-08-03', now), true);
    assert.equal(isBookingSlotElapsed('2026-08-03', '00:00', now), true);
    assert.equal(isBookingSlotElapsed('2026-08-03', '01:00', now), false);
});

test('getEndTime supports multi-hour durations and rolls past midnight', () => {
    assert.equal(getEndTime('12:00', 2), '14:00');
    assert.equal(getEndTime('23:00'), '00:00');
    assert.equal(getEndTime('23:00', 2), '01:00');
    assert.equal(getEndTime('00:00'), '01:00');
    assert.equal(getEndTime('01:00'), '02:00');
});
