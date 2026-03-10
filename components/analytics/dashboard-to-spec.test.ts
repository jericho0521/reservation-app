import assert from 'node:assert/strict';
import test from 'node:test';
import { dashboardToSpec } from './dashboard-to-spec';

test('dashboardToSpec creates metric, chart, and insights sections', () => {
    const spec = dashboardToSpec({
        cards: [
            {
                label: 'Revenue',
                value: 'RM 1200',
                color: 'green',
            },
        ],
        charts: [
            {
                type: 'bar',
                title: 'Bookings by Day',
                data: [{ label: 'Mon', value: 5 }],
            },
        ],
        insights: {
            title: 'Highlights',
            items: ['Mondays are busiest'],
        },
    });

    assert.equal(spec.root, 'root-layout');
    assert.equal(spec.elements['root-layout'].type, 'Stack');
    assert.deepEqual(spec.elements['cards-grid'].children, ['metric-card-1']);
    assert.equal(spec.elements['metric-card-1'].type, 'MetricCard');
    assert.equal(spec.elements['charts-grid'].type, 'Grid');
    assert.equal(spec.elements['chart-1'].type, 'Chart');
    assert.equal(spec.elements['insights-list'].type, 'Insights');
});

test('dashboardToSpec adds an empty state when no dashboard widgets exist', () => {
    const spec = dashboardToSpec({});

    assert.deepEqual(spec.elements['root-layout'].children, ['empty-state']);
    assert.deepEqual(spec.elements['empty-state'], {
        type: 'Text',
        props: {
            content: 'No analytics data available for this query.',
            muted: true,
        },
    });
});
