export type MetricCardColor = 'neon' | 'blue' | 'green' | 'purple' | 'orange' | 'red';

export interface ChartDataItem {
    label: string;
    value: number;
}

export interface MetricCardProps {
    label: string;
    value: string;
    trend?: string;
    trendDirection?: 'up' | 'down' | 'neutral';
    color?: MetricCardColor;
}

export interface ChartProps {
    type: 'bar' | 'line' | 'pie';
    title: string;
    data: ChartDataItem[];
}

export interface InsightsProps {
    title?: string;
    items: string[];
}

export interface TextProps {
    content: string;
    muted?: boolean;
}

export interface StackProps {
    direction?: 'vertical' | 'horizontal';
    gap?: 'sm' | 'md' | 'lg';
}

export interface GridProps {
    columns?: '1' | '2' | '3' | '4' | 1 | 2 | 3 | 4;
    gap?: 'sm' | 'md' | 'lg';
}

export interface SectionProps {
    title?: string;
    description?: string;
    collapsible?: boolean;
    expandedStatePath?: string;
}

export interface ButtonProps {
    label: string;
    variant?: 'primary' | 'secondary' | 'ghost';
}

export interface VisibilityCondition {
    $state: string;
    eq?: string | number | boolean;
    not?: boolean;
}

export type AnalyticsAction =
    | {
        action: 'setState';
        params: {
            path: string;
            value: unknown;
        };
    }
    | {
        action: 'toggleSection';
        params: {
            path: string;
        };
    }
    | {
        action: 'applyFilter';
        params: {
            field: string;
            value: string | number | boolean;
        };
    }
    | {
        action: 'drilldown';
        params: {
            target: string;
            value: string | number | boolean;
            label?: string;
        };
    };

export interface AnalyticsActions {
    press?: AnalyticsAction | AnalyticsAction[];
}

interface BaseElement {
    id?: string;
    children?: string[];
    visible?: VisibilityCondition | VisibilityCondition[];
    on?: AnalyticsActions;
}

export type AnalyticsElement =
    | (BaseElement & { type: 'MetricCard'; props: MetricCardProps })
    | (BaseElement & { type: 'Chart'; props: ChartProps })
    | (BaseElement & { type: 'Insights'; props: InsightsProps })
    | (BaseElement & { type: 'Text'; props: TextProps })
    | (BaseElement & { type: 'Stack'; props?: StackProps })
    | (BaseElement & { type: 'Grid'; props?: GridProps })
    | (BaseElement & { type: 'Section'; props?: SectionProps })
    | (BaseElement & { type: 'Button'; props: ButtonProps });

export interface AnalyticsSpec {
    root: string;
    elements: Record<string, AnalyticsElement>;
    state?: Record<string, unknown>;
}
