export interface AnalyticsComponentDefinition {
    description: string;
    props: string[];
}

export interface AnalyticsActionDefinition {
    description: string;
    params: string[];
}

export const analyticsCatalog = {
    components: {
        Stack: {
            description: 'Layout container for vertical or horizontal stacking',
            props: ['direction: vertical|horizontal', 'gap: sm|md|lg'],
        },
        Grid: {
            description: 'Layout container for responsive grid sections',
            props: ['columns: 1|2|3|4', 'gap: sm|md|lg'],
        },
        Section: {
            description: 'Titled section wrapper with optional collapsible behavior',
            props: ['title?: string', 'description?: string', 'collapsible?: boolean', 'expandedStatePath?: string'],
        },
        Text: {
            description: 'Plain text block for labels, helper copy, or summaries',
            props: ['content: string', 'muted?: boolean'],
        },
        MetricCard: {
            description: 'KPI card for headline business metrics',
            props: ['label: string', 'value: string', 'trend?: string', 'trendDirection?: up|down|neutral', 'color?: neon|blue|green|purple|orange|red'],
        },
        Chart: {
            description: 'Chart card for booking/revenue visualizations',
            props: ['type: bar|line|pie', 'title: string', 'data: [{ label: string, value: number }]'],
        },
        Insights: {
            description: 'Bullet insight list for narrative findings',
            props: ['title?: string', 'items: string[]'],
        },
        Button: {
            description: 'Interactive button used to trigger analytics actions',
            props: ['label: string', 'variant?: primary|secondary|ghost'],
        },
    } satisfies Record<string, AnalyticsComponentDefinition>,
    actions: {
        setState: {
            description: 'Set a value in UI state by path',
            params: ['path: string', 'value: unknown'],
        },
        toggleSection: {
            description: 'Toggle boolean section state by path',
            params: ['path: string'],
        },
        applyFilter: {
            description: 'Apply analytics filter criteria in local UI state',
            params: ['field: string', 'value: string|number|boolean'],
        },
        drilldown: {
            description: 'Store a drilldown selection target/value pair',
            params: ['target: string', 'value: string|number|boolean', 'label?: string'],
        },
    } satisfies Record<string, AnalyticsActionDefinition>,
};

function formatComponentsPrompt(): string {
    return Object.entries(analyticsCatalog.components)
        .map(([name, def]) => `- ${name}: ${def.description}. Props: ${def.props.join(', ')}`)
        .join('\n');
}

function formatActionsPrompt(): string {
    return Object.entries(analyticsCatalog.actions)
        .map(([name, def]) => `- ${name}: ${def.description}. Params: ${def.params.join(', ')}`)
        .join('\n');
}

export function buildAnalyticsCatalogPrompt(): string {
    return `You are an analytics UI spec generator.
Return JSON only. Do not return markdown.

Output format:
{
  "root": "string element key",
  "elements": {
    "key": {
      "type": "ComponentType",
      "props": {},
      "children": ["child-key"],
      "visible": { "$state": "/path", "eq": "value" },
      "on": {
        "press": { "action": "setState", "params": { "path": "/foo", "value": true } }
      }
    }
  }
}

Rules:
- Use only components listed below.
- Use only actions listed below.
- Keep UI compact and useful for business analytics.
- Prefer 1 root layout element (Stack or Grid).
- Keep child references valid (no missing keys).
- For cards/charts/insights, map directly to provided analytics data.
- Keep total elements under 40.
- Limit sections to at most 6.
- Grid columns may be "1"-"4" or numeric 1-4.

Allowed Components:
${formatComponentsPrompt()}

Allowed Actions:
${formatActionsPrompt()}`;
}
