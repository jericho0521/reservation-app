import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getRelevantContext } from '@/lib/knowledge';

const SYSTEM_PROMPT = `You are a friendly booking assistant for PROJECT PLAY by CW.

Available services:
- Racing Simulator (16 seats) - High-fidelity motion racing simulators
- Playstation 5 (2 seats) - Premium PS5 gaming stations

Operating Hours: 12 PM - 2 AM (1-hour time slots)

TODAY'S DATE: ${new Date().toISOString().split('T')[0]}

When users say dates like "tomorrow", "next Monday", "this Friday", etc., convert them to YYYY-MM-DD format using today's date as reference.

Help users book sessions by:
1. Asking which service they want
2. Checking availability for their preferred date (convert natural language dates)
3. Getting number of seats, name, and email
4. Creating the booking

Use the provided functions to check availability and create bookings.
Always confirm all details before creating a booking.`;

// Tool functions
async function getServices() {
    const { data, error } = await supabase
        .from('services')
        .select('id, name, description, total_seats');
    if (error) return { error: error.message };
    return { services: data };
}

async function checkAvailability(serviceName: string, date: string) {
    const { data: service } = await supabase
        .from('services')
        .select('id, name, total_seats')
        .ilike('name', `%${serviceName}%`)
        .single();

    if (!service) return { error: 'Service not found' };

    const { data: bookings } = await supabase
        .from('bookings')
        .select('start_time, seats_booked')
        .eq('service_id', service.id)
        .eq('booking_date', date)
        .eq('status', 'confirmed');

    const hours = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0, 1];
    const slots = hours.map(hour => {
        const startTime = `${hour.toString().padStart(2, '0')}:00`;
        const bookedSeats = (bookings || [])
            .filter(b => b.start_time.startsWith(startTime))
            .reduce((sum, b) => sum + b.seats_booked, 0);
        const availableSeats = service.total_seats - bookedSeats;

        return { time: startTime, available_seats: availableSeats };
    }).filter(s => s.available_seats > 0);

    return {
        service_name: service.name,
        service_id: service.id,
        date,
        total_seats: service.total_seats,
        available_slots: slots
    };
}

async function createBooking(
    serviceName: string,
    date: string,
    startTime: string,
    seats: number,
    userName: string,
    userEmail: string
) {
    // Look up service by name
    const { data: service } = await supabase
        .from('services')
        .select('id, total_seats')
        .ilike('name', `%${serviceName}%`)
        .single();

    if (!service) return { success: false, error: 'Service not found' };

    const { data: existing } = await supabase
        .from('bookings')
        .select('seats_booked')
        .eq('service_id', service.id)
        .eq('booking_date', date)
        .eq('start_time', startTime)
        .eq('status', 'confirmed');

    const bookedSeats = (existing || []).reduce((sum, b) => sum + b.seats_booked, 0);
    if (seats > service.total_seats - bookedSeats) {
        return { success: false, error: `Only ${service.total_seats - bookedSeats} seats available` };
    }

    const startHour = parseInt(startTime.split(':')[0]);
    const endHour = startHour === 0 ? 1 : startHour === 1 ? 2 : startHour + 1;
    const endTime = `${endHour.toString().padStart(2, '0')}:00`;

    const { data: booking, error } = await supabase
        .from('bookings')
        .insert({
            service_id: service.id,
            user_name: userName,
            user_email: userEmail,
            booking_date: date,
            start_time: startTime,
            end_time: endTime,
            seats_booked: seats,
            status: 'confirmed',
            interface_type: 'chat',
        })
        .select()
        .single();

    if (error) return { success: false, error: error.message };
    return {
        success: true,
        booking_id: booking.id,
        message: `Booking confirmed! ${seats} seat(s) on ${date} at ${startTime}.`
    };
}

// OpenRouter function definitions
const tools = [
    {
        type: 'function',
        function: {
            name: 'get_services',
            description: 'Get list of available services',
            parameters: { type: 'object', properties: {}, required: [] }
        }
    },
    {
        type: 'function',
        function: {
            name: 'check_availability',
            description: 'Check available time slots for a service on a specific date',
            parameters: {
                type: 'object',
                properties: {
                    service_name: { type: 'string', description: 'Name of the service (Racing Simulator or Playstation 5)' },
                    date: { type: 'string', description: 'Date in YYYY-MM-DD format' }
                },
                required: ['service_name', 'date']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'prepare_booking',
            description: 'Prepare a booking for user confirmation. Call this when you have ALL details: service, date, time, seats, name, email. This does NOT create the booking yet - it shows a confirmation card to the user.',
            parameters: {
                type: 'object',
                properties: {
                    service_name: { type: 'string', description: 'Name of the service (Racing Simulator or Playstation 5)' },
                    date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
                    start_time: { type: 'string', description: 'Start time in HH:MM format' },
                    seats: { type: 'number', description: 'Number of seats' },
                    user_name: { type: 'string', description: 'Customer name' },
                    user_email: { type: 'string', description: 'Customer email' }
                },
                required: ['service_name', 'date', 'start_time', 'seats', 'user_name', 'user_email']
            }
        }
    }
];

// Execute tool call
async function executeTool(name: string, args: Record<string, unknown>) {
    switch (name) {
        case 'get_services':
            return await getServices();
        case 'check_availability':
            return await checkAvailability(args.service_name as string, args.date as string);
        case 'prepare_booking':
            // Just return the booking data - actual creation happens when user clicks Confirm
            return {
                ready_for_confirmation: true,
                service_name: args.service_name,
                date: args.date,
                start_time: args.start_time,
                seats: args.seats,
                user_name: args.user_name,
                user_email: args.user_email
            };
        default:
            return { error: 'Unknown function' };
    }
}

// Check if assistant message contains booking confirmation request
function extractBookingAction(content: string, toolCalls: unknown[]): { type: string; data: unknown } | null {
    // Look for the prepare_booking tool call to extract data
    if (toolCalls && Array.isArray(toolCalls)) {
        for (const call of toolCalls) {
            const tc = call as { function?: { name?: string; arguments?: string } };
            if (tc.function?.name === 'prepare_booking') {
                try {
                    const args = JSON.parse(tc.function.arguments || '{}');
                    return {
                        type: 'booking_confirmation',
                        data: {
                            service: args.service_name,
                            date: args.date,
                            time: args.start_time,
                            seats: args.seats,
                            name: args.user_name,
                            email: args.user_email
                        }
                    };
                } catch {
                    return null;
                }
            }
        }
    }
    return null;
}

export async function POST(req: Request) {
    const body = await req.json();
    const { messages, confirmBooking } = body;

    // If this is a booking confirmation request
    if (confirmBooking) {
        const result = await createBooking(
            confirmBooking.service,
            confirmBooking.date,
            confirmBooking.time,
            confirmBooking.seats,
            confirmBooking.name,
            confirmBooking.email
        );
        return Response.json({
            content: result.success
                ? `Great! Your booking is confirmed! 🎉 You've booked ${confirmBooking.seats} seat(s) for ${confirmBooking.service} on ${confirmBooking.date} at ${confirmBooking.time}. A confirmation will be sent to ${confirmBooking.email}.`
                : `Sorry, there was an issue: ${result.error}`,
            action: result.success ? { type: 'booking_success', data: confirmBooking } : null
        });
    }

    // Get the latest user message for context retrieval
    const latestUserMessage = [...messages].reverse().find((m: { role: string }) => m.role === 'user')?.content || '';

    // Retrieve relevant context from knowledge base
    const context = await getRelevantContext(latestUserMessage);

    // Build enhanced system prompt with context
    const enhancedSystemPrompt = context
        ? `${SYSTEM_PROMPT}

IMPORTANT: When you have collected ALL booking details (service, date, time, seats, name, email), respond with a summary asking the user to confirm. Format the details clearly.

${context}`
        : `${SYSTEM_PROMPT}

IMPORTANT: When you have collected ALL booking details (service, date, time, seats, name, email), DO NOT call create_booking yet. Instead, respond with a summary of the details and ask the user to confirm. Only call create_booking after they explicitly confirm.`;

    // Prepare messages for OpenRouter
    const apiMessages = [
        { role: 'system', content: enhancedSystemPrompt },
        ...messages.map((m: { role: string; content: string }) => ({
            role: m.role,
            content: m.content,
        })),
    ];

    // Make initial request to OpenRouter with BYOK Gemini
    let response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'http://localhost:3000',
        },
        body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: apiMessages,
            tools,
            tool_choice: 'auto',
            max_tokens: 1024,
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        console.error('OpenRouter error:', error);
        return NextResponse.json({ error: 'Failed to get AI response' }, { status: 500 });
    }

    let result = await response.json();
    let assistantMessage = result.choices?.[0]?.message;
    let lastToolCalls: unknown[] = [];

    // Process tool calls if any
    while (assistantMessage?.tool_calls && assistantMessage.tool_calls.length > 0) {
        lastToolCalls = assistantMessage.tool_calls;
        const toolResults = [];

        for (const toolCall of assistantMessage.tool_calls) {
            const funcName = toolCall.function.name;
            const funcArgs = JSON.parse(toolCall.function.arguments || '{}');
            const toolResult = await executeTool(funcName, funcArgs);

            toolResults.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: JSON.stringify(toolResult),
            });
        }

        // Add assistant message and tool results to conversation
        apiMessages.push(assistantMessage);
        apiMessages.push(...toolResults);

        // Get next response
        response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'http://localhost:3000',
            },
            body: JSON.stringify({
                model: 'google/gemini-2.5-flash',
                messages: apiMessages,
                tools,
                tool_choice: 'auto',
                max_tokens: 1024,
            }),
        });

        if (!response.ok) break;
        result = await response.json();
        assistantMessage = result.choices?.[0]?.message;
    }

    // Check if this was a booking creation
    const action = extractBookingAction(assistantMessage?.content || '', lastToolCalls);

    // Return JSON response with potential action
    const content = assistantMessage?.content || 'Sorry, I encountered an error.';

    return Response.json({
        content,
        action
    });
}

