import { z } from 'zod';
import type { AnalyticsAction, AnalyticsElement, AnalyticsSpec, VisibilityCondition } from './spec-types';

const chartDataItemSchema = z.object({
    label: z.string(),
    value: z.number(),
});

const metricCardColorSchema = z.enum(['neon', 'blue', 'green', 'purple', 'orange', 'red']);

const metricCardPropsSchema = z.object({
    label: z.string(),
    value: z.string(),
    trend: z.string().optional(),
    trendDirection: z.enum(['up', 'down', 'neutral']).optional(),
    color: metricCardColorSchema.optional(),
});

const chartPropsSchema = z.object({
    type: z.enum(['bar', 'line', 'pie']),
    title: z.string(),
    data: z.array(chartDataItemSchema),
});

const insightsPropsSchema = z.object({
    title: z.string().optional(),
    items: z.array(z.string()),
});

const textPropsSchema = z.object({
    content: z.string(),
    muted: z.boolean().optional(),
});

const stackPropsSchema = z.object({
    direction: z.enum(['vertical', 'horizontal']).optional(),
    gap: z.enum(['sm', 'md', 'lg']).optional(),
});

const gridPropsSchema = z.object({
    columns: z.union([z.enum(['1', '2', '3', '4']), z.number().int().min(1).max(4)]).optional(),
    gap: z.enum(['sm', 'md', 'lg']).optional(),
});

const sectionPropsSchema = z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    collapsible: z.boolean().optional(),
    expandedStatePath: z.string().optional(),
});

const buttonPropsSchema = z.object({
    label: z.string(),
    variant: z.enum(['primary', 'secondary', 'ghost']).optional(),
});

const visibilityConditionSchema: z.ZodType<VisibilityCondition> = z.object({
    $state: z.string(),
    eq: z.union([z.string(), z.number(), z.boolean()]).optional(),
    not: z.boolean().optional(),
});

const setStateActionSchema: z.ZodType<Extract<AnalyticsAction, { action: 'setState' }>> = z.object({
    action: z.literal('setState'),
    params: z.object({
        path: z.string(),
        value: z.unknown(),
    }),
});

const toggleSectionActionSchema: z.ZodType<Extract<AnalyticsAction, { action: 'toggleSection' }>> = z.object({
    action: z.literal('toggleSection'),
    params: z.object({
        path: z.string(),
    }),
});

const applyFilterActionSchema: z.ZodType<Extract<AnalyticsAction, { action: 'applyFilter' }>> = z.object({
    action: z.literal('applyFilter'),
    params: z.object({
        field: z.string(),
        value: z.union([z.string(), z.number(), z.boolean()]),
    }),
});

const drilldownActionSchema: z.ZodType<Extract<AnalyticsAction, { action: 'drilldown' }>> = z.object({
    action: z.literal('drilldown'),
    params: z.object({
        target: z.string(),
        value: z.union([z.string(), z.number(), z.boolean()]),
        label: z.string().optional(),
    }),
});

const analyticsActionSchema: z.ZodType<AnalyticsAction> = z.union([
    setStateActionSchema,
    toggleSectionActionSchema,
    applyFilterActionSchema,
    drilldownActionSchema,
]);

const analyticsActionsSchema = z.object({
    press: z.union([analyticsActionSchema, z.array(analyticsActionSchema)]).optional(),
});

const baseElementSchema = z.object({
    id: z.string().optional(),
    children: z.array(z.string()).optional(),
    visible: z.union([visibilityConditionSchema, z.array(visibilityConditionSchema)]).optional(),
    on: analyticsActionsSchema.optional(),
});

const metricCardElementSchema = baseElementSchema.extend({
    type: z.literal('MetricCard'),
    props: metricCardPropsSchema,
});

const chartElementSchema = baseElementSchema.extend({
    type: z.literal('Chart'),
    props: chartPropsSchema,
});

const insightsElementSchema = baseElementSchema.extend({
    type: z.literal('Insights'),
    props: insightsPropsSchema,
});

const textElementSchema = baseElementSchema.extend({
    type: z.literal('Text'),
    props: textPropsSchema,
});

const stackElementSchema = baseElementSchema.extend({
    type: z.literal('Stack'),
    props: stackPropsSchema.optional(),
});

const gridElementSchema = baseElementSchema.extend({
    type: z.literal('Grid'),
    props: gridPropsSchema.optional(),
});

const sectionElementSchema = baseElementSchema.extend({
    type: z.literal('Section'),
    props: sectionPropsSchema.optional(),
});

const buttonElementSchema = baseElementSchema.extend({
    type: z.literal('Button'),
    props: buttonPropsSchema,
});

export const analyticsElementSchema: z.ZodType<AnalyticsElement> = z.discriminatedUnion('type', [
    metricCardElementSchema,
    chartElementSchema,
    insightsElementSchema,
    textElementSchema,
    stackElementSchema,
    gridElementSchema,
    sectionElementSchema,
    buttonElementSchema,
]);

export const analyticsSpecSchema: z.ZodType<AnalyticsSpec> = z.object({
    root: z.string(),
    elements: z.record(z.string(), analyticsElementSchema),
    state: z.record(z.string(), z.unknown()).optional(),
});

export type { AnalyticsAction, AnalyticsElement, AnalyticsSpec, VisibilityCondition } from './spec-types';

export function parseAnalyticsSpec(input: unknown): {
    success: true;
    data: AnalyticsSpec;
} | {
    success: false;
    error: string;
} {
    const result = analyticsSpecSchema.safeParse(input);

    if (!result.success) {
        return {
            success: false,
            error: result.error.issues.map(issue => issue.message).join('; '),
        };
    }

    if (!result.data.elements[result.data.root]) {
        return {
            success: false,
            error: `Root element "${result.data.root}" is missing from elements map`,
        };
    }

    return {
        success: true,
        data: result.data,
    };
}
