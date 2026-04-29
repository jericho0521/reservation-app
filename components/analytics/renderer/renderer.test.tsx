import assert from 'node:assert/strict';
import test from 'node:test';
import type { Dispatch, SetStateAction } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AnalyticsRenderer, applyAnalyticsAction, evaluateVisibilityCondition, isElementVisible } from './AnalyticsRenderer';
import type { AnalyticsElement, AnalyticsSpec } from './spec';

test('applyAnalyticsAction handles setState and toggleSection', () => {
    const afterSet = applyAnalyticsAction(
        {},
        { action: 'setState', params: { path: '/sections/insightsOpen', value: true } },
    );

    assert.equal((afterSet.sections as Record<string, unknown>).insightsOpen, true);

    const afterToggle = applyAnalyticsAction(
        afterSet,
        { action: 'toggleSection', params: { path: '/sections/insightsOpen' } },
    );

    assert.equal((afterToggle.sections as Record<string, unknown>).insightsOpen, false);
});

test('applyAnalyticsAction handles applyFilter and drilldown', () => {
    const afterFilter = applyAnalyticsAction(
        {},
        { action: 'applyFilter', params: { field: 'service', value: 'PS5' } },
    );

    assert.equal((afterFilter.filters as Record<string, unknown>).service, 'PS5');

    const afterDrilldown = applyAnalyticsAction(
        afterFilter,
        { action: 'drilldown', params: { target: 'service', value: 'Racing Simulator', label: 'Top service' } },
    );

    assert.deepEqual(afterDrilldown.drilldown, {
        target: 'service',
        value: 'Racing Simulator',
        label: 'Top service',
    });
});

test('visibility conditions support eq and not', () => {
    const state = { filters: { service: 'PS5' }, flags: { hidden: false } };

    assert.equal(
        evaluateVisibilityCondition({ $state: '/filters/service', eq: 'PS5' }, state),
        true,
    );

    assert.equal(
        evaluateVisibilityCondition({ $state: '/flags/hidden', not: true }, state),
        true,
    );
});

test('isElementVisible evaluates all conditions in arrays', () => {
    const state = { flags: { show: true }, filters: { service: 'PS5' } };

    const element: AnalyticsElement = {
        type: 'Text',
        props: { content: 'visible text' },
        visible: [
            { $state: '/flags/show' },
            { $state: '/filters/service', eq: 'PS5' },
        ],
    };

    assert.equal(isElementVisible(element, state), true);
});

test('renderer gracefully renders fallback for unknown element type', () => {
    const badSpec = {
        root: 'root',
        elements: {
            root: {
                type: 'UnsupportedWidget',
                props: {},
            },
        },
    } as unknown as AnalyticsSpec;

    const noopSetState = (() => undefined) as unknown as Dispatch<SetStateAction<Record<string, unknown>>>;

    const html = renderToStaticMarkup(
        <AnalyticsRenderer
            spec={badSpec}
            uiState={{}}
            setUiState={noopSetState}
        />,
    );

    assert.match(html, /Unknown analytics element type/);
});

test('renderer passes rich chart props through to analytics charts', () => {
    const chartSpec: AnalyticsSpec = {
        root: 'root',
        elements: {
            root: {
                type: 'Chart',
                props: {
                    type: 'line',
                    title: 'Revenue Over Time',
                    subtitle: 'Daily revenue across the selected period',
                    xKey: 'date',
                    yKey: 'revenue',
                    format: 'currency',
                    emptyMessage: 'No revenue data for this period.',
                    data: [],
                    series: [{ key: 'revenue', name: 'Revenue', color: '#39FF14' }],
                },
            },
        },
    };

    const noopSetState = (() => undefined) as unknown as Dispatch<SetStateAction<Record<string, unknown>>>;

    const html = renderToStaticMarkup(
        <AnalyticsRenderer
            spec={chartSpec}
            uiState={{}}
            setUiState={noopSetState}
        />,
    );

    assert.match(html, /Revenue Over Time/);
    assert.match(html, /Daily revenue across the selected period/);
    assert.match(html, /No revenue data for this period./);
});

test('renderer respects explicit top-level section order', () => {
    const spec: AnalyticsSpec = {
        root: 'root',
        elements: {
            root: {
                type: 'Stack',
                children: ['metrics', 'charts', 'insights'],
            },
            metrics: {
                type: 'Text',
                props: { content: 'Metrics Section' },
            },
            charts: {
                type: 'Text',
                props: { content: 'Charts Section' },
            },
            insights: {
                type: 'Text',
                props: { content: 'Insights Section' },
            },
        },
    };

    const noopSetState = (() => undefined) as unknown as Dispatch<SetStateAction<Record<string, unknown>>>;

    const html = renderToStaticMarkup(
        <AnalyticsRenderer
            spec={spec}
            uiState={{}}
            setUiState={noopSetState}
            layoutState={{ root: ['charts', 'insights', 'metrics'] }}
        />,
    );

    assert.ok(html.indexOf('Charts Section') < html.indexOf('Insights Section'));
    assert.ok(html.indexOf('Insights Section') < html.indexOf('Metrics Section'));
});

test('renderer respects nested grid ordering as well as root ordering', () => {
    const spec: AnalyticsSpec = {
        root: 'root',
        elements: {
            root: {
                type: 'Stack',
                children: ['metrics-grid', 'insights'],
            },
            'metrics-grid': {
                type: 'Grid',
                children: ['card-a', 'card-b', 'card-c'],
            },
            insights: {
                type: 'Text',
                props: { content: 'Insights Section' },
            },
            'card-a': {
                type: 'Text',
                props: { content: 'Metric A' },
            },
            'card-b': {
                type: 'Text',
                props: { content: 'Metric B' },
            },
            'card-c': {
                type: 'Text',
                props: { content: 'Metric C' },
            },
        },
    };

    const noopSetState = (() => undefined) as unknown as Dispatch<SetStateAction<Record<string, unknown>>>;

    const html = renderToStaticMarkup(
        <AnalyticsRenderer
            spec={spec}
            uiState={{}}
            setUiState={noopSetState}
            layoutState={{
                root: ['insights', 'metrics-grid'],
                'metrics-grid': ['card-c', 'card-a', 'card-b'],
            }}
        />,
    );

    assert.ok(html.indexOf('Insights Section') < html.indexOf('Metric C'));
    assert.ok(html.indexOf('Metric C') < html.indexOf('Metric A'));
    assert.ok(html.indexOf('Metric A') < html.indexOf('Metric B'));
});
