import assert from 'node:assert/strict';
import test from 'node:test';
import type { Dispatch, SetStateAction } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AnalyticsRenderer, applyAnalyticsAction, evaluateVisibilityCondition, isElementVisible } from './AnalyticsRenderer';
import type { AnalyticsSpec } from './spec';

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

    const element = {
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
