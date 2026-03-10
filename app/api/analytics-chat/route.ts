import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { buildAnalyticsCatalogPrompt } from '@/components/analytics/renderer/catalog';
import { extractSpecAndFallback } from '@/components/analytics/spec-adapter';

// Hardcoded pricing (RM per hour per seat)
const PRICING: Record<string, number> = {
    'Racing Simulator': 15,
    'Playstation 5': 30,
};

const DASHBOARD_SCHEMA = `${buildAnalyticsCatalogPrompt()}

Additional analytics guidelines:
- Build for booking/revenue analytics use-cases.
- Generate 2-4 metric cards, 1-2 charts, and 3-5 insights when data supports it.
- Use RM for currency values.
- Keep text concise and data-driven.
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
      "data": [{ "label": "string", "value": number }]
    }
  ]
}

Rules:
- 2-4 cards maximum
- 1-2 charts maximum
- 3-5 insights maximum
- Keep JSON short and complete
`;

interface AICompletionResult {
    content: unknown;
    finishReason?: string;
}

interface BookingData {
    booking_date: string;
    start_time: string;
    seats_booked: number;
    status: string;
    services: { name: string } | { name: string }[] | null;
}

interface AnalyticsSnapshot {
    period: {
        start?: string;
        end?: string;
    };
    totals: {
        bookings: number;
        confirmed: number;
        completed: number;
        cancelled: number;
        seats: number;
    };
    revenue: {
        total: number;
        earned: number;
        pending: number;
        lost: number;
    };
    services: Array<{
        name: string;
        bookings: number;
        seats: number;
        revenue: number;
        completed: number;
        confirmed: number;
        cancelled: number;
    }>;
    bookingsByDay: Array<{ label: string; value: number }>;
    bookingsByHour: Array<{ label: string; value: number }>;
    statusCounts: Array<{ label: string; value: number }>;
}

const DAY_ORDER = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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

function getServiceName(services: BookingData['services']): string {
    if (Array.isArray(services)) {
        return services[0]?.name || 'Unknown';
    }

    return services?.name || 'Unknown';
}

async function getBookingSnapshot(startDate?: string, endDate?: string): Promise<AnalyticsSnapshot | null> {
    let query = supabase
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

    const typedBookings = (bookings ?? []) as BookingData[];
    const serviceMap = new Map<string, AnalyticsSnapshot['services'][number]>();
    const dayMap = new Map<string, number>();
    const hourMap = new Map<string, number>();
    const statusMap = new Map<string, number>();
    const snapshot: AnalyticsSnapshot = {
        period: { start: startDate, end: endDate },
        totals: {
            bookings: typedBookings.length,
            confirmed: 0,
            completed: 0,
            cancelled: 0,
            seats: 0,
        },
        revenue: {
            total: 0,
            earned: 0,
            pending: 0,
            lost: 0,
        },
        services: [],
        bookingsByDay: [],
        bookingsByHour: [],
        statusCounts: [],
    };

    for (const booking of typedBookings) {
        const serviceName = getServiceName(booking.services);
        const price = PRICING[serviceName] || 0;
        const bookingRevenue = booking.seats_booked * price;

        snapshot.totals.seats += booking.seats_booked;

        if (booking.status === 'confirmed') {
            snapshot.totals.confirmed += 1;
            snapshot.revenue.pending += bookingRevenue;
            snapshot.revenue.total += bookingRevenue;
        }

        if (booking.status === 'completed') {
            snapshot.totals.completed += 1;
            snapshot.revenue.earned += bookingRevenue;
            snapshot.revenue.total += bookingRevenue;
        }

        if (booking.status === 'cancelled') {
            snapshot.totals.cancelled += 1;
            snapshot.revenue.lost += bookingRevenue;
        }

        const serviceStats = serviceMap.get(serviceName) ?? {
            name: serviceName,
            bookings: 0,
            seats: 0,
            revenue: 0,
            completed: 0,
            confirmed: 0,
            cancelled: 0,
        };

        serviceStats.bookings += 1;
        serviceStats.seats += booking.seats_booked;

        if (booking.status === 'completed') {
            serviceStats.completed += 1;
            serviceStats.revenue += bookingRevenue;
        }

        if (booking.status === 'confirmed') {
            serviceStats.confirmed += 1;
            serviceStats.revenue += bookingRevenue;
        }

        if (booking.status === 'cancelled') {
            serviceStats.cancelled += 1;
        }

        serviceMap.set(serviceName, serviceStats);

        statusMap.set(booking.status, (statusMap.get(booking.status) ?? 0) + 1);

        const dayOfWeek = new Date(booking.booking_date).toLocaleDateString('en-US', { weekday: 'long' });
        dayMap.set(dayOfWeek, (dayMap.get(dayOfWeek) ?? 0) + 1);

        const hour = booking.start_time.slice(0, 5);
        hourMap.set(hour, (hourMap.get(hour) ?? 0) + 1);
    }

    snapshot.services = [...serviceMap.values()].sort((left, right) => right.bookings - left.bookings);
    snapshot.bookingsByDay = DAY_ORDER
        .filter(day => dayMap.has(day))
        .map(day => ({ label: day, value: dayMap.get(day) ?? 0 }));
    snapshot.bookingsByHour = [...hourMap.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([label, value]) => ({ label, value }));
    snapshot.statusCounts = [...statusMap.entries()].map(([label, value]) => ({ label, value }));

    return snapshot;
}

function buildAnalyticsPrompt(prompt: string, snapshot: AnalyticsSnapshot): string {
    return `User Query: "${prompt}"

Analytics Snapshot JSON:
${JSON.stringify(snapshot)}

Generate an analytics UI spec JSON response using the allowed component catalog.`;
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
        const { prompt } = await req.json();

        if (!prompt || typeof prompt !== 'string') {
            return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
        }

        // Parse date range from prompt
        const { startDate, endDate } = parseDateRange(prompt);

        const snapshot = await getBookingSnapshot(startDate, endDate);

        if (!snapshot) {
            return NextResponse.json({ error: 'Failed to fetch booking data' }, { status: 500 });
        }

        const primaryUserPrompt = buildAnalyticsPrompt(prompt, snapshot);
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
