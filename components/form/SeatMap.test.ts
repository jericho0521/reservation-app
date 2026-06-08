import assert from 'node:assert/strict';
import test from 'node:test';
import { computeNextSeatSelection, getResourceIndexesFromLabels, getSeatNumbersFromLabels } from './SeatMap';

test('computeNextSeatSelection adds a seat that is not selected', () => {
    assert.deepEqual(computeNextSeatSelection([1, 2], 3), [1, 2, 3]);
});

test('computeNextSeatSelection removes a selected seat', () => {
    assert.deepEqual(computeNextSeatSelection([1, 2, 3], 2), [1, 3]);
});

test('getSeatNumbersFromLabels parses valid racing simulator labels', () => {
    assert.deepEqual(getSeatNumbersFromLabels(['RS1', 'RS 2', 'PS1', 'RS17'], 16), [1, 2]);
});

test('getResourceIndexesFromLabels maps generic labels without RS assumptions', () => {
    const resources = [
        { label: 'A1' },
        { label: 'A2' },
        { label: 'VIP-Box' },
        { label: 'Screen 1 Row B' },
    ];

    assert.deepEqual(
        getResourceIndexesFromLabels(['vip-box', 'Screen 1 Row B', 'RS1'], resources),
        [3, 4],
    );
});
