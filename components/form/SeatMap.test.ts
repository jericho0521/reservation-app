import assert from 'node:assert/strict';
import test from 'node:test';
import { computeNextSeatSelection, getSeatNumbersFromLabels } from './SeatMap';

test('computeNextSeatSelection adds a seat that is not selected', () => {
    assert.deepEqual(computeNextSeatSelection([1, 2], 3), [1, 2, 3]);
});

test('computeNextSeatSelection removes a selected seat', () => {
    assert.deepEqual(computeNextSeatSelection([1, 2, 3], 2), [1, 3]);
});

test('getSeatNumbersFromLabels parses valid racing simulator labels', () => {
    assert.deepEqual(getSeatNumbersFromLabels(['RS1', 'RS 2', 'PS1', 'RS17'], 16), [1, 2]);
});
