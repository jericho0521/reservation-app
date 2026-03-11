import type { ChartProps } from '@/components/analytics/renderer/spec-types';

export type DashboardColor = 'neon' | 'blue' | 'green' | 'purple' | 'orange' | 'red';

export interface DashboardCard {
    label: string;
    value: string;
    trend?: string;
    trendDirection?: 'up' | 'down' | 'neutral';
    color?: DashboardColor;
}

export interface DashboardInsights {
    title?: string;
    items: string[];
}

export type DashboardChart = ChartProps;

export interface DashboardResponse {
    cards?: DashboardCard[];
    insights?: DashboardInsights;
    charts?: DashboardChart[];
}

export type LegacyDashboardResponse = DashboardResponse;
