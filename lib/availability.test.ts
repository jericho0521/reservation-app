import assert from 'node:assert/strict';
import test from 'node:test';
import { generateTimeSlots, getEndTime } from './availability';

test('generateTimeSlots subtracts booked seats and marks full slots', () => {
    const slots = generateTimeSlots(4, [
        { start_time: '12:00', seats_booked: 1 },
        { start_time: '12:00', seats_booked: 2 },
        { start_time: '13:00', seats_booked: 4 },
    ]);

    assert.deepEqual(slots[0], {
        start_time: '12:00',
        end_time: '13:00',
        available_seats: 1,
        is_available: true,
    });

    assert.deepEqual(slots[1], {
        start_time: '13:00',
        end_time: '14:00',
        available_seats: 0,
        is_available: false,
    });
});

test('getEndTime rolls midnight slots forward correctly', () => {
    assert.equal(getEndTime('23:00'), '00:00');
    assert.equal(getEndTime('00:00'), '01:00');
    assert.equal(getEndTime('01:00'), '02:00');
});
