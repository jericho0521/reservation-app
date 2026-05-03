import assert from 'node:assert/strict';
import test from 'node:test';
import { computeNextSeatSelection } from './SeatMap';

test('computeNextSeatSelection adds a seat that is not selected', () => {
    assert.deepEqual(computeNextSeatSelection([1, 2], 3), [1, 2, 3]);
});

test('computeNextSeatSelection removes a selected seat', () => {
    assert.deepEqual(computeNextSeatSelection([1, 2, 3], 2), [1, 3]);
});
