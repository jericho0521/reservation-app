'use client';

import { MetricCard } from './MetricCard';
import { InsightsList } from './InsightsList';
import { ChartPlaceholder } from './ChartPlaceholder';

// Dashboard response types from AI
export interface DashboardCard {
    label: string;
    value: string;
    trend?: string;
    trendDirection?: 'up' | 'down' | 'neutral';
    color?: 'neon' | 'blue' | 'green' | 'purple' | 'orange' | 'red';
}

export interface DashboardInsights {
    title?: string;
    items: string[];
}

export interface DashboardChart {
    type: 'bar' | 'line' | 'pie';
    title: string;
    data: { label: string; value: number }[];
}

export interface DashboardResponse {
    cards?: DashboardCard[];
    insights?: DashboardInsights;
    charts?: DashboardChart[];
}

interface DynamicDashboardProps {
    data: DashboardResponse | null;
    isLoading?: boolean;
}

export function DynamicDashboard({ data, isLoading }: DynamicDashboardProps) {
    if (isLoading) {
        return (
            <div className="space-y-6">
                {/* Loading skeleton for cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="glass-panel p-6 rounded-xl border border-white/10 animate-pulse">
                            <div className="h-4 bg-white/10 rounded w-1/2 mb-3" />
                            <div className="h-8 bg-white/10 rounded w-3/4" />
                        </div>
                    ))}
                </div>
                {/* Loading skeleton for insights */}
                <div className="glass-panel p-6 rounded-xl border border-white/10 animate-pulse">
                    <div className="h-5 bg-white/10 rounded w-1/4 mb-4" />
                    <div className="space-y-3">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="h-4 bg-white/10 rounded w-full" />
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    if (!data) {
        return null;
    }

    return (
        <div className="space-y-6">
            {/* Metric Cards */}
            {data.cards && data.cards.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {data.cards.map((card, index) => (
                        <MetricCard
                            key={index}
                            label={card.label}
                            value={card.value}
                            trend={card.trend}
                            trendDirection={card.trendDirection}
                            color={card.color}
                        />
                    ))}
                </div>
            )}

            {/* Charts */}
            {data.charts && data.charts.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {data.charts.map((chart, index) => (
                        <ChartPlaceholder
                            key={index}
                            type={chart.type}
                            title={chart.title}
                            data={chart.data}
                        />
                    ))}
                </div>
            )}

            {/* Insights */}
            {data.insights && data.insights.items && data.insights.items.length > 0 && (
                <InsightsList
                    title={data.insights.title}
                    items={data.insights.items}
                />
            )}
        </div>
    );
}
