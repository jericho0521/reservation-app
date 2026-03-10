import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAnalyticsSpec } from './spec';

test('parseAnalyticsSpec accepts a valid analytics spec', () => {
    const result = parseAnalyticsSpec({
        root: 'root',
        elements: {
            root: {
                type: 'Stack',
                props: { direction: 'vertical', gap: 'md' },
                children: ['metric-1'],
            },
            'metric-1': {
                type: 'MetricCard',
                props: {
                    label: 'Total Revenue',
                    value: 'RM 1,250',
                    trend: '+8%',
                    trendDirection: 'up',
                    color: 'green',
                },
            },
        },
    });

    assert.equal(result.success, true);
    if (result.success) {
        assert.equal(result.data.root, 'root');
    }
});

test('parseAnalyticsSpec accepts numeric grid columns', () => {
    const result = parseAnalyticsSpec({
        root: 'root',
        elements: {
            root: {
                type: 'Grid',
                props: { columns: 4, gap: 'md' },
                children: ['text-1'],
            },
            'text-1': {
                type: 'Text',
                props: { content: 'ok' },
            },
        },
    });

    assert.equal(result.success, true);
});

test('parseAnalyticsSpec rejects a missing root element reference', () => {
    const result = parseAnalyticsSpec({
        root: 'missing-root',
        elements: {
            root: {
                type: 'Text',
                props: { content: 'hello' },
            },
        },
    });

    assert.equal(result.success, false);
});

test('parseAnalyticsSpec rejects unknown component types', () => {
    const result = parseAnalyticsSpec({
        root: 'root',
        elements: {
            root: {
                type: 'UnknownWidget',
                props: {},
            },
        },
    });

    assert.equal(result.success, false);
});
