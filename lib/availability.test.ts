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
        taken_seat_labels: ['RS2', 'RS3', 'RS4'],
    });

    assert.deepEqual(slots[1], {
        start_time: '13:00',
        end_time: '14:00',
        available_seats: 0,
        is_available: false,
        taken_seat_labels: ['RS1', 'RS2', 'RS3', 'RS4'],
    });
});

test('generateTimeSlots returns actual taken seat labels for each slot', () => {
    const slots = generateTimeSlots(16, [
        { start_time: '14:00:00', seats_booked: 2, seat_labels: ['RS3', 'RS8'] },
        { start_time: '15:00', seats_booked: 1, seat_labels: ['RS12'] },
    ]);

    assert.equal(slots[2].start_time, '14:00');
    assert.equal(slots[2].available_seats, 14);
    assert.deepEqual(slots[2].taken_seat_labels, ['RS3', 'RS8']);

    assert.equal(slots[3].start_time, '15:00');
    assert.deepEqual(slots[3].taken_seat_labels, ['RS12']);
});

test('getEndTime rolls midnight slots forward correctly', () => {
    assert.equal(getEndTime('23:00'), '00:00');
    assert.equal(getEndTime('00:00'), '01:00');
    assert.equal(getEndTime('01:00'), '02:00');
});
