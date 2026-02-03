import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// Hardcoded pricing (RM per hour per seat)
const PRICING: Record<string, number> = {
    'Racing Simulator': 15,
    'Playstation 5': 30,
};

// Dashboard component schema for AI to generate
const DASHBOARD_SCHEMA = `
You are an analytics dashboard generator. Based on the booking data and user query, generate a JSON dashboard.

IMPORTANT: You MUST respond with valid JSON only. No markdown, no explanations.

JSON Schema:
{
  "cards": [
    {
      "label": "string (e.g., 'Total Revenue')",
      "value": "string (e.g., 'RM 1,250')",
      "trend": "string (e.g., '+12.5%')",
      "trendDirection": "up" | "down" | "neutral",
      "color": "neon" | "blue" | "green" | "purple" | "orange" | "red"
    }
  ],
  "insights": {
    "title": "string (e.g., 'Key Insights')",
    "items": ["string array of bullet points"]
  },
  "charts": [
    {
      "type": "bar" | "line" | "pie",
      "title": "string",
      "data": [{ "label": "string", "value": number }]
    }
  ]
}

Guidelines:
- Generate 2-4 metric cards based on the query
- Include 3-5 actionable insights
- Include 1-2 relevant charts if data supports it
- Use RM for currency (Malaysian Ringgit)
- Format numbers nicely (e.g., "1,250" not "1250")
- Be specific and data-driven in insights
`;

interface BookingData {
    id: string;
    service_id: string;
    booking_date: string;
    start_time: string;
    seats_booked: number;
    status: string;
    services: { name: string } | { name: string }[] | null;
}

// Fetch and aggregate booking statistics
async function getBookingStats(startDate?: string, endDate?: string) {
    // Fetch ALL bookings (confirmed, completed, cancelled) for comprehensive analytics
    let query = supabase
        .from('bookings')
        .select('id, service_id, booking_date, start_time, seats_booked, status, services(name)');

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

    const typedBookings = bookings as BookingData[];

    // Calculate statistics
    const stats = {
        totalBookings: typedBookings.length,
        confirmedBookings: typedBookings.filter(b => b.status === 'confirmed').length,
        completedBookings: typedBookings.filter(b => b.status === 'completed').length,
        cancelledBookings: typedBookings.filter(b => b.status === 'cancelled').length,
        totalSeats: typedBookings.reduce((sum, b) => sum + b.seats_booked, 0),
        totalRevenue: 0,         // All revenue (completed + confirmed)
        earnedRevenue: 0,        // Actual earned (completed bookings only)
        pendingRevenue: 0,       // Expected (confirmed but not yet completed)
        lostRevenue: 0,          // Lost due to cancellations
        byService: {} as Record<string, { bookings: number; seats: number; revenue: number; completed: number; cancelled: number }>,
        byDay: {} as Record<string, number>,
        byHour: {} as Record<string, number>,
        byStatus: {} as Record<string, number>,
    };

    for (const booking of typedBookings) {
        // Handle both array and object format from Supabase
        const services = booking.services;
        const serviceName = Array.isArray(services)
            ? services[0]?.name
            : services?.name || 'Unknown';
        const price = PRICING[serviceName] || 0;
        const bookingRevenue = booking.seats_booked * price;

        // By service
        if (!stats.byService[serviceName]) {
            stats.byService[serviceName] = { bookings: 0, seats: 0, revenue: 0, completed: 0, cancelled: 0 };
        }
        stats.byService[serviceName].bookings++;
        stats.byService[serviceName].seats += booking.seats_booked;

        // Track revenue by booking status
        if (booking.status === 'completed') {
            stats.earnedRevenue += bookingRevenue;
            stats.totalRevenue += bookingRevenue;
            stats.byService[serviceName].revenue += bookingRevenue;
            stats.byService[serviceName].completed++;
        } else if (booking.status === 'confirmed') {
            stats.pendingRevenue += bookingRevenue;
            stats.totalRevenue += bookingRevenue;
            stats.byService[serviceName].revenue += bookingRevenue;
        } else if (booking.status === 'cancelled') {
            stats.lostRevenue += bookingRevenue;
            stats.byService[serviceName].cancelled++;
        }

        // By status
        stats.byStatus[booking.status] = (stats.byStatus[booking.status] || 0) + 1;

        // By day of week
        const dayOfWeek = new Date(booking.booking_date).toLocaleDateString('en-US', { weekday: 'long' });
        stats.byDay[dayOfWeek] = (stats.byDay[dayOfWeek] || 0) + 1;

        // By hour
        const hour = booking.start_time.split(':')[0];
        stats.byHour[hour] = (stats.byHour[hour] || 0) + 1;
    }

    return {
        ...stats,
        dateRange: { start: startDate, end: endDate },
        generatedAt: new Date().toISOString(),
    };
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

        // Fetch booking statistics
        const stats = await getBookingStats(startDate, endDate);

        if (!stats) {
            return NextResponse.json({ error: 'Failed to fetch booking data' }, { status: 500 });
        }

        // Call OpenRouter API with JSON mode
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
                    { role: 'system', content: DASHBOARD_SCHEMA },
                    {
                        role: 'user',
                        content: `Booking Statistics:\n${JSON.stringify(stats, null, 2)}\n\nUser Query: "${prompt}"\n\nGenerate a dashboard JSON response.`
                    }
                ],
                response_format: { type: 'json_object' },
                max_tokens: 2048,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('OpenRouter API error:', errorText);
            return NextResponse.json({ error: 'AI service error' }, { status: 500 });
        }

        const result = await response.json();
        const content = result.choices?.[0]?.message?.content;

        if (!content) {
            return NextResponse.json({ error: 'No response from AI' }, { status: 500 });
        }

        // Parse and validate JSON response
        let dashboard;
        try {
            dashboard = JSON.parse(content);
        } catch {
            console.error('Failed to parse AI response:', content);
            return NextResponse.json({ error: 'Invalid AI response format' }, { status: 500 });
        }

        return NextResponse.json({
            dashboard,
            stats,
            query: prompt,
            dateRange: { startDate, endDate },
        });

    } catch (error) {
        console.error('Analytics chat error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
