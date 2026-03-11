import { z } from 'zod';
import type { AnalyticsSpec } from '@/components/analytics/renderer/spec-types';
import { parseAnalyticsSpec } from '@/components/analytics/renderer/spec';
import { dashboardToSpec } from './dashboard-to-spec';

const dashboardCardSchema = z.object({
    label: z.string(),
    value: z.string(),
    trend: z.string().optional(),
    trendDirection: z.enum(['up', 'down', 'neutral']).optional(),
    color: z.enum(['neon', 'blue', 'green', 'purple', 'orange', 'red']).optional(),
});

const dashboardChartSchema = z.object({
    type: z.enum(['bar', 'line', 'pie']),
    title: z.string(),
    subtitle: z.string().optional(),
    xKey: z.string().optional(),
    yKey: z.string().optional(),
    format: z.enum(['currency', 'number', 'percent']).optional(),
    legend: z.boolean().optional(),
    stacked: z.boolean().optional(),
    emptyMessage: z.string().optional(),
    series: z.array(z.object({
        key: z.string(),
        name: z.string(),
        color: z.string().optional(),
    })).optional(),
    data: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))),
});

const dashboardInsightsSchema = z.object({
    title: z.string().optional(),
    items: z.array(z.string()),
});

export const legacyDashboardResponseSchema = z.object({
    cards: z.array(dashboardCardSchema).optional(),
    charts: z.array(dashboardChartSchema).optional(),
    insights: dashboardInsightsSchema.optional(),
});

export type LegacyDashboardResponse = z.infer<typeof legacyDashboardResponseSchema>;

export function parseLegacyDashboard(input: unknown): LegacyDashboardResponse | null {
    const parsed = legacyDashboardResponseSchema.safeParse(input);
    return parsed.success ? parsed.data : null;
}

export function extractSpecAndFallback(input: unknown): {
    spec: AnalyticsSpec | null;
    fallbackDashboard: LegacyDashboardResponse | null;
    error?: string;
} {
    const specResult = parseAnalyticsSpec(input);
    if (specResult.success) {
        return {
            spec: specResult.data,
            fallbackDashboard: null,
        };
    }

    const legacy = parseLegacyDashboard(input);
    if (legacy) {
        return {
            spec: dashboardToSpec(legacy),
            fallbackDashboard: legacy,
        };
    }

    return {
        spec: null,
        fallbackDashboard: null,
        error: specResult.error,
    };
}
