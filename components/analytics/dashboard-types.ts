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

export type LegacyDashboardResponse = DashboardResponse;
