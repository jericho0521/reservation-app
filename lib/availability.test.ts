import assert from 'node:assert/strict';
import test from 'node:test';
import { generateTimeSlots, getBookableTimeSlots } from './availability';

test('generateTimeSlots subtracts booked seats and marks full slots', () => {
    const slots = generateTimeSlots(4, [
        { start_time: '12:00', end_time: '13:00', seats_booked: 1 },
        { start_time: '12:00', end_time: '13:00', seats_booked: 2 },
        { start_time: '13:00', end_time: '14:00', seats_booked: 4 },
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
        { start_time: '14:00:00', end_time: '15:00', seats_booked: 2, seat_labels: ['RS3', 'RS8'] },
        { start_time: '15:00', end_time: '16:00', seats_booked: 1, seat_labels: ['RS12'] },
    ]);

    assert.equal(slots[2].start_time, '14:00');
    assert.equal(slots[2].available_seats, 14);
    assert.deepEqual(slots[2].taken_seat_labels, ['RS3', 'RS8']);

    assert.equal(slots[3].start_time, '15:00');
    assert.deepEqual(slots[3].taken_seat_labels, ['RS12']);
});

test('generateTimeSlots blocks maintenance seats for every slot', () => {
    const slots = generateTimeSlots(16, [
        { start_time: '14:00:00', end_time: '15:00', seats_booked: 1, seat_labels: ['RS3'] },
    ], ['RS1', 'RS2']);

    assert.equal(slots[0].start_time, '12:00');
    assert.equal(slots[0].available_seats, 14);
    assert.deepEqual(slots[0].taken_seat_labels, ['RS1', 'RS2']);

    assert.equal(slots[2].start_time, '14:00');
    assert.equal(slots[2].available_seats, 13);
    assert.deepEqual(slots[2].taken_seat_labels, ['RS1', 'RS2', 'RS3']);
});

test('generateTimeSlots does not double-count booked seats under maintenance', () => {
    const slots = generateTimeSlots(16, [
        { start_time: '14:00:00', end_time: '15:00', seats_booked: 1, seat_labels: ['RS1'] },
    ], ['RS1', 'RS2']);

    assert.equal(slots[2].start_time, '14:00');
    assert.equal(slots[2].available_seats, 14);
    assert.deepEqual(slots[2].taken_seat_labels, ['RS1', 'RS2']);
});

test('generateTimeSlots fills missing seats after normalizing invalid labels', () => {
    const slots = generateTimeSlots(16, [
        { start_time: '14:00:00', end_time: '15:00', seats_booked: 3, seat_labels: ['RS1', 'RS1', 'PS1'] },
    ]);

    assert.equal(slots[2].start_time, '14:00');
    assert.equal(slots[2].available_seats, 13);
    assert.deepEqual(slots[2].taken_seat_labels, ['RS1', 'RS15', 'RS16']);
});

test('getBookableTimeSlots omits elapsed slots for a same-day booking', () => {
    const slots = getBookableTimeSlots(
        16,
        [],
        [],
        '2026-08-03',
        new Date('2026-08-03T06:30:00.000Z'), // 14:30 in Malaysia
    );

    assert.equal(slots.some(slot => slot.start_time === '12:00'), false);
    assert.equal(slots.some(slot => slot.start_time === '14:00'), false);
    assert.equal(slots.some(slot => slot.start_time === '15:00'), true);
});

test('getBookableTimeSlots keeps all operating slots for a future date', () => {
    const slots = getBookableTimeSlots(
        16,
        [],
        [],
        '2026-08-04',
        new Date('2026-08-03T06:30:00.000Z'),
    );

    assert.equal(slots.some(slot => slot.start_time === '12:00'), true);
    assert.equal(slots.some(slot => slot.start_time === '01:00'), true);
});

test('generateTimeSlots applies a multi-hour booking to every covered slot', () => {
    const slots = generateTimeSlots(4, [
        { start_time: '12:00', end_time: '14:00', seats_booked: 3 },
    ]);

    assert.equal(slots.find(slot => slot.start_time === '12:00')?.available_seats, 1);
    assert.equal(slots.find(slot => slot.start_time === '13:00')?.available_seats, 1);
    assert.equal(slots.find(slot => slot.start_time === '14:00')?.available_seats, 4);
});
