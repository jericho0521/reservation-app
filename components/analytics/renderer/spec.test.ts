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

test('parseAnalyticsSpec accepts rich chart props for interactive analytics dashboards', () => {
    const result = parseAnalyticsSpec({
        root: 'root',
        elements: {
            root: {
                type: 'Chart',
                props: {
                    type: 'line',
                    title: 'January Revenue Trend',
                    subtitle: 'Daily revenue across the selected month',
                    xKey: 'date',
                    yKey: 'revenue',
                    format: 'currency',
                    legend: true,
                    data: [
                        { date: '2026-01-01', revenue: 1200 },
                        { date: '2026-01-02', revenue: 1500 },
                    ],
                    series: [
                        {
                            key: 'revenue',
                            name: 'Revenue',
                            color: '#10B981',
                        },
                    ],
                    emptyMessage: 'No revenue data for this period.',
                },
                on: {
                    press: {
                        action: 'applyFilter',
                        params: {
                            field: 'month',
                            value: '2026-01',
                        },
                    },
                },
            },
        },
    });

    assert.equal(result.success, true);
});
