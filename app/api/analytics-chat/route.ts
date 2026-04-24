import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { buildAnalyticsCatalogPrompt } from '@/components/analytics/renderer/catalog';
import { extractSpecAndFallback } from '@/components/analytics/spec-adapter';
import { buildAnalyticsSnapshot, type AnalyticsSnapshot } from './snapshot';

const DASHBOARD_SCHEMA = `${buildAnalyticsCatalogPrompt()}

Additional analytics guidelines:
- Build for booking/revenue analytics use-cases.
- Generate 2-4 metric cards, 3-5 charts, and 3-5 insights when data supports it.
- Use RM for currency values.
- Keep text concise and data-driven.
- For revenue prompts, include at least one trend chart and one composition or comparison chart.
- Use line charts for trends over dates, pie charts for revenue share, and bar charts for service or period comparisons.
- When enough data exists, also include demand timing charts like bookings by weekday or hour.
- Reuse the prebuilt chart suggestions in topLevelCharts when they fit the question.
- Prefer chart titles that clearly answer the user's question.
- When filters are provided, honor them in titles, subtitles, and insights.
- Always return valid JSON with a single root and valid element references.
- Do not exceed 40 total elements.
- Prefer concise output over exhaustive output.`;

const FALLBACK_DASHBOARD_SCHEMA = `
You are an analytics dashboard generator.
Respond with valid JSON only.

Schema:
{
  "cards": [
    {
      "label": "string",
      "value": "string",
      "trend": "string (optional)",
      "trendDirection": "up" | "down" | "neutral",
      "color": "neon" | "blue" | "green" | "purple" | "orange" | "red"
    }
  ],
  "insights": {
    "title": "string",
    "items": ["string"]
  },
  "charts": [
    {
      "type": "bar" | "line" | "pie",
      "title": "string",
      "subtitle": "string (optional)",
      "xKey": "string (optional)",
      "yKey": "string (optional)",
      "format": "currency" | "number" | "percent",
      "legend": true,
      "data": [{ "label": "string", "value": number }]
    }
  ]
}

Rules:
- 2-4 cards maximum
- 2-4 charts maximum
- 3-5 insights maximum
- Keep JSON short and complete
`;

interface AICompletionResult {
    content: unknown;
    finishReason?: string;
}

async function requestAICompletion({
    systemPrompt,
    userPrompt,
    maxTokens,
}: {
    systemPrompt: string;
    userPrompt: string;
    maxTokens: number;
}): Promise<AICompletionResult> {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'http://localhost:3000',
        },
        body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            response_format: { type: 'json_object' },
            max_tokens: maxTokens,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenRouter API error: ${errorText}`);
    }

    const result = await response.json();
    return {
        content: result.choices?.[0]?.message?.content,
        finishReason: result.choices?.[0]?.finish_reason,
    };
}

function parseModelJson(content: unknown): unknown | null {
    if (!content) {
        return null;
    }

    if (typeof content === 'object') {
        return content;
    }

    if (typeof content !== 'string') {
        return null;
    }

    const trimmed = content.trim();
    const withoutFences = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

    try {
        return JSON.parse(withoutFences);
    } catch {
        // Try to recover when model adds text before/after the JSON object.
    }

    const start = withoutFences.indexOf('{');
    const end = withoutFences.lastIndexOf('}');
    if (start >= 0 && end > start) {
        try {
            return JSON.parse(withoutFences.slice(start, end + 1));
        } catch {
            return null;
        }
    }

    return null;
}

async function getBookingSnapshot(startDate?: string, endDate?: string): Promise<AnalyticsSnapshot | null> {
    let query = supabase()
        .from('bookings')
        .select('booking_date, start_time, seats_booked, status, services(name)');

    if (startDate) {
        query = query.gte('booking_date', startDate);
    }
    if (endDate) {
        query = query.lte('booking_date', endDate);
    }

    const { data: bookings, error } = await query;

    if (error) {
        console.error('Error fetching bookings:', error);
        return null;
    }

    return buildAnalyticsSnapshot(bookings ?? [], startDate, endDate);
}

function buildAnalyticsPrompt(
    prompt: string,
    snapshot: AnalyticsSnapshot,
    previousQuery?: string,
    filters?: Record<string, unknown>,
): string {
    const hasFilters = filters && Object.keys(filters).length > 0;

    return `User Query: "${prompt}"

Previous Query Context: ${previousQuery ? `"${previousQuery}"` : 'None'}

Active Filters: ${hasFilters ? JSON.stringify(filters) : 'None'}

Analytics Snapshot JSON:
${JSON.stringify(snapshot)}

Generate an analytics UI spec JSON response using the allowed component catalog.

Dashboard generation goals:
- Answer the latest user query directly.
- Prefer visually clear analytics with charts over walls of text.
- For revenue questions, highlight trend + mix + key KPIs.
- Prefer 3-5 graphs when the question is broad enough to support them.
- If active filters exist, reflect them in chart subtitles and insight wording.
- Use concise, business-friendly titles and subtitles.`;
}

// Parse natural language date references
function parseDateRange(query: string): { startDate?: string; endDate?: string } {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    const lowerQuery = query.toLowerCase();

    // Month names
    const months = ['january', 'february', 'march', 'april', 'may', 'june',
        'july', 'august', 'september', 'october', 'november', 'december'];

    for (let i = 0; i < months.length; i++) {
        if (lowerQuery.includes(months[i])) {
            const targetYear = i > month ? year - 1 : year; // Handle past months
            const startDate = `${targetYear}-${String(i + 1).padStart(2, '0')}-01`;
            const lastDay = new Date(targetYear, i + 1, 0).getDate();
            const endDate = `${targetYear}-${String(i + 1).padStart(2, '0')}-${lastDay}`;
            return { startDate, endDate };
        }
    }

    // Relative terms
    if (lowerQuery.includes('this month')) {
        const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
        const lastDay = new Date(year, month + 1, 0).getDate();
        const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${lastDay}`;
        return { startDate, endDate };
    }

    if (lowerQuery.includes('last month')) {
        const lastMonth = month === 0 ? 11 : month - 1;
        const targetYear = month === 0 ? year - 1 : year;
        const startDate = `${targetYear}-${String(lastMonth + 1).padStart(2, '0')}-01`;
        const lastDay = new Date(targetYear, lastMonth + 1, 0).getDate();
        const endDate = `${targetYear}-${String(lastMonth + 1).padStart(2, '0')}-${lastDay}`;
        return { startDate, endDate };
    }

    if (lowerQuery.includes('this week')) {
        const dayOfWeek = now.getDay();
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - dayOfWeek);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);

        return {
            startDate: startOfWeek.toISOString().split('T')[0],
            endDate: endOfWeek.toISOString().split('T')[0],
        };
    }

    if (lowerQuery.includes('today')) {
        const today = now.toISOString().split('T')[0];
        return { startDate: today, endDate: today };
    }

    // Default: last 30 days
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);
    return {
        startDate: thirtyDaysAgo.toISOString().split('T')[0],
        endDate: now.toISOString().split('T')[0],
    };
}

export async function POST(req: Request) {
    try {
        const { prompt, previousQuery, filters } = await req.json();

        if (!prompt || typeof prompt !== 'string') {
            return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
        }

        // Parse date range from prompt
        const { startDate, endDate } = parseDateRange(prompt);

        const snapshot = await getBookingSnapshot(startDate, endDate);

        if (!snapshot) {
            return NextResponse.json({ error: 'Failed to fetch booking data' }, { status: 500 });
        }

        const primaryUserPrompt = buildAnalyticsPrompt(
            prompt,
            snapshot,
            typeof previousQuery === 'string' ? previousQuery : undefined,
            filters && typeof filters === 'object' ? filters as Record<string, unknown> : undefined,
        );
        let aiResult: AICompletionResult;
        try {
            aiResult = await requestAICompletion({
                systemPrompt: DASHBOARD_SCHEMA,
                userPrompt: primaryUserPrompt,
                maxTokens: 2400,
            });
        } catch (aiError) {
            console.error('OpenRouter request failed:', aiError);
            return NextResponse.json({ error: 'AI service error' }, { status: 500 });
        }

        let parsedPayload = parseModelJson(aiResult.content);

        if (!parsedPayload) {
            console.warn('Primary analytics spec parse failed; retrying with compact fallback schema.', {
                finishReason: aiResult.finishReason,
            });

            const fallbackUserPrompt = `User Query: "${prompt}"

Analytics Snapshot JSON:
${JSON.stringify(snapshot)}

Return a compact dashboard JSON now.`;
            try {
                aiResult = await requestAICompletion({
                    systemPrompt: FALLBACK_DASHBOARD_SCHEMA,
                    userPrompt: fallbackUserPrompt,
                    maxTokens: 1200,
                });
            } catch (aiError) {
                console.error('Fallback OpenRouter request failed:', aiError);
                return NextResponse.json({ error: 'AI service error' }, { status: 500 });
            }

            parsedPayload = parseModelJson(aiResult.content);
        }

        if (!parsedPayload) {
            console.error('Failed to parse AI response after fallback attempt:', aiResult.content);
            return NextResponse.json({ error: 'Invalid AI response format' }, { status: 500 });
        }

        const { spec, fallbackDashboard, error } = extractSpecAndFallback(parsedPayload);

        if (!spec) {
            console.error('AI response failed spec validation:', error, parsedPayload);
            return NextResponse.json({ error: 'Invalid AI response schema' }, { status: 500 });
        }

        return NextResponse.json({
            spec,
            fallbackDashboard,
        });

    } catch (error) {
        console.error('Analytics chat error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
