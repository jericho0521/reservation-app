import type { ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { MetricCard } from '@/components/analytics/MetricCard';
import { ChartPlaceholder } from '@/components/analytics/ChartPlaceholder';
import { InsightsList } from '@/components/analytics/InsightsList';
import type { AnalyticsElement } from './spec-types';

type ElementType = AnalyticsElement['type'];

type PropsByType<T extends ElementType> = Extract<AnalyticsElement, { type: T }>['props'];

export interface RegistryRenderContext<TProps> {
    props: TProps;
    children?: ReactNode;
    emit: (event: 'press') => void;
    uiState: Record<string, unknown>;
    getStateValue: (path?: string) => unknown;
}

export type RegistryComponent<T extends ElementType> = (context: RegistryRenderContext<PropsByType<T>>) => ReactNode;

export type AnalyticsRegistry = {
    [K in ElementType]: RegistryComponent<K>;
};

const gapClassMap: Record<string, string> = {
    sm: 'gap-2',
    md: 'gap-4',
    lg: 'gap-6',
};

const gridColsMap: Record<string, string> = {
    '1': 'grid-cols-1',
    '2': 'grid-cols-1 md:grid-cols-2',
    '3': 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    '4': 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4',
};

const buttonVariantClassMap: Record<string, string> = {
    primary: 'bg-neon text-racing-dark hover:bg-neon/90',
    secondary: 'bg-white/10 text-white hover:bg-white/20',
    ghost: 'bg-transparent text-white hover:bg-white/10 border border-white/20',
};

export const analyticsRegistry: AnalyticsRegistry = {
    Stack: ({ props, children }) => {
        const direction = props?.direction === 'horizontal' ? 'flex-row items-start' : 'flex-col';
        const gap = gapClassMap[props?.gap ?? 'md'] ?? gapClassMap.md;
        return <div className={`flex ${direction} ${gap}`}>{children}</div>;
    },
    Grid: ({ props, children }) => {
        const columnKey = String(props?.columns ?? '2');
        const columns = gridColsMap[columnKey] ?? gridColsMap['2'];
        const gap = gapClassMap[props?.gap ?? 'md'] ?? gapClassMap.md;
        return <div className={`grid ${columns} ${gap}`}>{children}</div>;
    },
    Section: ({ props, children, emit, getStateValue }) => {
        const expandedPath = props?.expandedStatePath;
        const isExpanded = expandedPath ? getStateValue(expandedPath) !== false : true;
        const isCollapsible = props?.collapsible === true;

        return (
            <section className="glass-panel p-5 rounded-xl border border-white/10 space-y-3">
                {(props?.title || props?.description) && (
                    <div className="space-y-1">
                        <div className="flex items-center justify-between gap-3">
                            {props?.title ? <h3 className="font-heading text-lg font-bold">{props.title}</h3> : <div />}
                            {isCollapsible && (
                                <button
                                    type="button"
                                    onClick={() => emit('press')}
                                    className="p-1 rounded-md border border-white/10 hover:border-neon/40 hover:bg-white/5 transition-colors"
                                >
                                    {isExpanded ? (
                                        <ChevronDown className="w-4 h-4 text-neon" />
                                    ) : (
                                        <ChevronRight className="w-4 h-4 text-neon" />
                                    )}
                                </button>
                            )}
                        </div>
                        {props?.description && (
                            <p className="text-sm text-gray-400">{props.description}</p>
                        )}
                    </div>
                )}
                {(!isCollapsible || isExpanded) && children}
            </section>
        );
    },
    Text: ({ props }) => (
        <p className={props.muted ? 'text-sm text-gray-400' : 'text-sm text-gray-200'}>
            {props.content}
        </p>
    ),
    MetricCard: ({ props }) => (
        <MetricCard
            label={props.label}
            value={props.value}
            trend={props.trend}
            trendDirection={props.trendDirection}
            color={props.color}
        />
    ),
    Chart: ({ props }) => (
        <ChartPlaceholder
            type={props.type}
            title={props.title}
            subtitle={props.subtitle}
            data={props.data}
            xKey={props.xKey}
            yKey={props.yKey}
            format={props.format}
            legend={props.legend}
            stacked={props.stacked}
            emptyMessage={props.emptyMessage}
            series={props.series}
        />
    ),
    Insights: ({ props }) => (
        <InsightsList title={props.title} items={props.items} />
    ),
    Button: ({ props, emit }) => (
        <button
            type="button"
            onClick={() => emit('press')}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                buttonVariantClassMap[props.variant ?? 'primary'] ?? buttonVariantClassMap.primary
            }`}
        >
            {props.label}
        </button>
    ),
};
