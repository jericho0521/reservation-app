import type { AnalyticsSpec } from '@/components/analytics/renderer/spec-types';
import type { DashboardResponse } from './dashboard-types';

export function dashboardToSpec(dashboard: DashboardResponse): AnalyticsSpec {
    const rootKey = 'root-layout';
    const elements: AnalyticsSpec['elements'] = {
        [rootKey]: {
            type: 'Stack',
            props: {
                direction: 'vertical',
                gap: 'lg',
            },
            children: [],
        },
    };

    const rootChildren = elements[rootKey].children ?? [];

    if (dashboard.cards?.length) {
        const cardsGridKey = 'cards-grid';
        elements[cardsGridKey] = {
            type: 'Grid',
            props: {
                columns: '4',
                gap: 'md',
            },
            children: [],
        };
        rootChildren.push(cardsGridKey);

        dashboard.cards.forEach((card, index) => {
            const key = `metric-card-${index + 1}`;
            elements[key] = {
                type: 'MetricCard',
                props: card,
            };
            elements[cardsGridKey].children?.push(key);
        });
    }

    if (dashboard.charts?.length) {
        const chartsGridKey = 'charts-grid';
        elements[chartsGridKey] = {
            type: 'Grid',
            props: {
                columns: '2',
                gap: 'lg',
            },
            children: [],
        };
        rootChildren.push(chartsGridKey);

        dashboard.charts.forEach((chart, index) => {
            const key = `chart-${index + 1}`;
            elements[key] = {
                type: 'Chart',
                props: chart,
            };
            elements[chartsGridKey].children?.push(key);
        });
    }

    if (dashboard.insights?.items?.length) {
        const insightsKey = 'insights-list';
        elements[insightsKey] = {
            type: 'Insights',
            props: dashboard.insights,
        };
        rootChildren.push(insightsKey);
    }

    if (rootChildren.length === 0) {
        const emptyStateKey = 'empty-state';
        elements[emptyStateKey] = {
            type: 'Text',
            props: {
                content: 'No analytics data available for this query.',
                muted: true,
            },
        };
        rootChildren.push(emptyStateKey);
    }

    elements[rootKey].children = rootChildren;

    return {
        root: rootKey,
        elements,
    };
}
