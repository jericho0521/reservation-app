'use client';

import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Legend,
    Line,
    LineChart,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { BarChart3, LineChart as LineChartIcon, PieChart as PieChartIcon } from 'lucide-react';
import type { ChartProps, ChartValue } from '@/components/analytics/renderer/spec-types';

type ChartComponentProps = ChartProps;

const iconMap = {
    bar: BarChart3,
    line: LineChartIcon,
    pie: PieChartIcon,
};

const CHART_COLORS = ['#39FF14', '#60A5FA', '#C084FC', '#FB923C', '#4ADE80', '#F472B6', '#22D3EE'];

function formatChartValue(value: ChartValue, format?: ChartProps['format']) {
    if (typeof value !== 'number') {
        return String(value ?? '');
    }

    if (format === 'currency') {
        return `RM${value.toLocaleString('en-MY')}`;
    }

    if (format === 'percent') {
        return `${value.toFixed(1)}%`;
    }

    return value.toLocaleString('en-MY');
}

function getCategoryValue(item: Record<string, ChartValue>, key?: string) {
    if (key && item[key] !== undefined) {
        return String(item[key] ?? '');
    }

    if (item.label !== undefined) {
        return String(item.label ?? '');
    }

    const firstStringEntry = Object.values(item).find(value => typeof value === 'string');
    return String(firstStringEntry ?? '');
}

function getNumericValue(item: Record<string, ChartValue>, key?: string) {
    if (key && typeof item[key] === 'number') {
        return item[key] as number;
    }

    if (typeof item.value === 'number') {
        return item.value;
    }

    const firstNumberEntry = Object.values(item).find(value => typeof value === 'number');
    return typeof firstNumberEntry === 'number' ? firstNumberEntry : 0;
}

function CustomTooltip({
    active,
    payload,
    label,
    format,
}: {
    active?: boolean;
    payload?: Array<{ value?: ChartValue; name?: string; color?: string }>;
    label?: string;
    format?: ChartProps['format'];
}) {
    if (!active || !payload?.length) {
        return null;
    }

    return (
        <div className="rounded-xl border border-white/10 bg-racing-dark/95 px-3 py-2 shadow-lg shadow-black/30">
            {label ? <p className="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-gray-500">{label}</p> : null}
            <div className="space-y-1">
                {payload.map((entry, index) => (
                    <div key={index} className="flex items-center justify-between gap-4 text-sm">
                        <span className="text-gray-300" style={{ color: entry.color }}>{entry.name}</span>
                        <span className="font-semibold text-white">{formatChartValue(entry.value ?? '', format)}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

export function ChartPlaceholder({
    type,
    title,
    subtitle,
    data,
    xKey,
    yKey,
    format,
    legend,
    series,
    emptyMessage,
}: ChartComponentProps) {
    const Icon = iconMap[type] || BarChart3;
    const resolvedSeries = series?.length
        ? series
        : [{ key: yKey ?? 'value', name: title, color: CHART_COLORS[0] }];
    const resolvedXKey = xKey ?? 'label';
    const resolvedYKey = yKey ?? resolvedSeries[0]?.key ?? 'value';

    const normalizedData = data.map(item => {
        const chartItem = item as Record<string, ChartValue>;
        return {
            ...chartItem,
            [resolvedXKey]: getCategoryValue(chartItem, resolvedXKey),
            [resolvedYKey]: getNumericValue(chartItem, resolvedYKey),
        };
    });

    const renderEmptyState = () => (
        <div className="flex h-[320px] items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.02] text-center">
            <div className="space-y-2 px-6">
                <p className="text-sm font-medium text-white">{title}</p>
                <p className="text-sm text-gray-400">{emptyMessage ?? 'No data available for this chart.'}</p>
            </div>
        </div>
    );

    return (
        <div className="glass-panel rounded-2xl border border-white/10 p-6">
            <div className="mb-5 flex items-start gap-3">
                <div className="mt-1 rounded-lg border border-neon/20 bg-neon/10 p-2">
                    <Icon className="h-4 w-4 text-neon" />
                </div>
                <div className="space-y-1">
                    <h3 className="font-heading text-lg font-bold text-white">{title}</h3>
                    {subtitle ? <p className="text-sm text-gray-400">{subtitle}</p> : null}
                </div>
            </div>

            {normalizedData.length === 0 ? renderEmptyState() : (
                <div className="h-[320px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        {type === 'pie' ? (
                            <PieChart>
                                <Tooltip content={<CustomTooltip format={format} />} />
                                {legend ? <Legend /> : null}
                                <Pie
                                    data={normalizedData}
                                    dataKey={resolvedYKey}
                                    nameKey={resolvedXKey}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={55}
                                    outerRadius={100}
                                    paddingAngle={3}
                                >
                                    {normalizedData.map((_, index) => (
                                        <Cell key={index} fill={resolvedSeries[index]?.color ?? CHART_COLORS[index % CHART_COLORS.length]} />
                                    ))}
                                </Pie>
                            </PieChart>
                        ) : type === 'line' ? (
                            <LineChart data={normalizedData} margin={{ top: 12, right: 16, bottom: 0, left: 4 }}>
                                <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                                <XAxis dataKey={resolvedXKey} stroke="#94A3B8" tickLine={false} axisLine={false} />
                                <YAxis
                                    stroke="#94A3B8"
                                    tickLine={false}
                                    axisLine={false}
                                    tickFormatter={value => formatChartValue(value, format)}
                                />
                                <Tooltip content={<CustomTooltip format={format} />} />
                                {legend ? <Legend /> : null}
                                {resolvedSeries.map((entry, index) => (
                                    <Line
                                        key={entry.key}
                                        type="monotone"
                                        dataKey={entry.key}
                                        name={entry.name}
                                        stroke={entry.color ?? CHART_COLORS[index % CHART_COLORS.length]}
                                        strokeWidth={3}
                                        dot={{ r: 4 }}
                                        activeDot={{ r: 6 }}
                                    />
                                ))}
                            </LineChart>
                        ) : (
                            <BarChart data={normalizedData} margin={{ top: 12, right: 16, bottom: 0, left: 4 }}>
                                <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                                <XAxis dataKey={resolvedXKey} stroke="#94A3B8" tickLine={false} axisLine={false} />
                                <YAxis
                                    stroke="#94A3B8"
                                    tickLine={false}
                                    axisLine={false}
                                    tickFormatter={value => formatChartValue(value, format)}
                                />
                                <Tooltip content={<CustomTooltip format={format} />} />
                                {legend ? <Legend /> : null}
                                {resolvedSeries.map((entry, index) => (
                                    <Bar
                                        key={entry.key}
                                        dataKey={entry.key}
                                        name={entry.name}
                                        radius={[8, 8, 0, 0]}
                                        fill={entry.color ?? CHART_COLORS[index % CHART_COLORS.length]}
                                    />
                                ))}
                            </BarChart>
                        )}
                    </ResponsiveContainer>
                </div>
            )}
        </div>
    );
}
