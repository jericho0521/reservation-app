import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getEndTime, generateTimeSlots } from '@/lib/availability';
import { getRelevantContext } from '@/lib/knowledge';
import { extractPreparedBookingAction, resolveToolCalls, type ToolCall } from './tool-loop';
import { buildSystemPrompt, getMalaysiaDateString, getOpenRouterChatModel } from './chat-config';

interface ServiceRecord {
    id: string;
    name: string;
    total_seats: number;
}

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

interface ConfirmBookingPayload {
    service: string;
    date: string;
    time: string;
    seats: number;
    name: string;
    email: string;
}

interface OpenRouterMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    tool_call_id?: string;
    tool_calls?: ToolCall[];
}

interface OpenRouterAssistantMessage extends OpenRouterMessage {
    role: 'assistant';
    tool_calls?: ToolCall[];
}

// Tool functions
async function getServices() {
    const { data, error } = await supabase
        .from('services')
        .select('id, name, description, total_seats');
    if (error) return { error: error.message };
    return { services: data };
}

async function getServiceByName(serviceName: string): Promise<ServiceRecord | null> {
    const { data, error } = await supabase
        .from('services')
        .select('id, name, total_seats')
        .ilike('name', `%${serviceName}%`)
        .single();

    if (error || !data) {
        return null;
    }

    return data;
}

async function checkAvailability(serviceName: string, date: string) {
    const service = await getServiceByName(serviceName);
    if (!service) return { error: 'Service not found' };

    const { data: bookings } = await supabase
        .from('bookings')
        .select('start_time, seats_booked')
        .eq('service_id', service.id)
        .eq('booking_date', date)
        .eq('status', 'confirmed');

    const slots = generateTimeSlots(service.total_seats, bookings || [])
        .filter(slot => slot.is_available)
        .map(slot => ({
            time: slot.start_time,
            available_seats: slot.available_seats,
        }));

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
    const service = await getServiceByName(serviceName);
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

    const endTime = getEndTime(startTime);

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

async function requestOpenRouterCompletion(messages: OpenRouterMessage[], attempt = 0): Promise<OpenRouterAssistantMessage> {
    const maxRetries = 3;
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'http://localhost:3000',
        },
        body: JSON.stringify({
            model: getOpenRouterChatModel(),
            messages,
            tools,
            tool_choice: 'auto',
            temperature: 0.2,
            max_tokens: 1024,
        }),
    });

    if (response.status === 429 && attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        console.warn(`Rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return requestOpenRouterCompletion(messages, attempt + 1);
    }

    if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Failed to get AI response');
    }

    const result = await response.json();
    const message = result.choices?.[0]?.message;

    return {
        role: 'assistant',
        content: message?.content || '',
        tool_calls: Array.isArray(message?.tool_calls) ? message.tool_calls : undefined,
    };
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const messages = (Array.isArray(body.messages) ? body.messages : []) as ChatMessage[];
        const confirmBooking = body.confirmBooking as ConfirmBookingPayload | undefined;

        if (confirmBooking) {
            const result = await createBooking(
                confirmBooking.service,
                confirmBooking.date,
                confirmBooking.time,
                confirmBooking.seats,
                confirmBooking.name,
                confirmBooking.email,
            );

            return Response.json({
                content: result.success
                    ? `Great! Your booking is confirmed! 🎉 You've booked ${confirmBooking.seats} seat(s) for ${confirmBooking.service} on ${confirmBooking.date} at ${confirmBooking.time}. A confirmation will be sent to ${confirmBooking.email}.`
                    : `Sorry, there was an issue: ${result.error}`,
                action: result.success ? { type: 'booking_success', data: confirmBooking } : null,
            });
        }

        const latestUserMessage = [...messages].reverse().find(message => message.role === 'user')?.content || '';
        const context = latestUserMessage ? await getRelevantContext(latestUserMessage) : '';
        const systemPrompt = buildSystemPrompt(getMalaysiaDateString());
        const enhancedSystemPrompt = context
            ? `${systemPrompt}

${context}`
            : systemPrompt;

        const apiMessages: OpenRouterMessage[] = [
            { role: 'system', content: enhancedSystemPrompt },
            ...messages.map(message => ({
                role: message.role,
                content: message.content,
            })),
        ];

        let assistantMessage = await requestOpenRouterCompletion(apiMessages);
        let lastToolCalls: ToolCall[] = [];

        while (assistantMessage.tool_calls?.length) {
            lastToolCalls = assistantMessage.tool_calls;
            apiMessages.push(assistantMessage);

            const toolResults = await resolveToolCalls(assistantMessage.tool_calls, executeTool);
            apiMessages.push(...toolResults);

            assistantMessage = await requestOpenRouterCompletion(apiMessages);
        }

        return Response.json({
            content: assistantMessage.content || 'Sorry, I encountered an error.',
            action: extractPreparedBookingAction(lastToolCalls),
        });
    } catch (error) {
        console.error('Chat route error:', error);
        const errorText = error instanceof Error ? error.message : String(error);
        const isRateLimit = errorText.includes('429') || errorText.includes('quota') || errorText.includes('RESOURCE_EXHAUSTED');
        const userMessage = isRateLimit
            ? "I'm receiving too many requests right now. Please wait a moment and try again."
            : 'Something went wrong. Please try again.';
        return NextResponse.json({ content: userMessage }, { status: 200 });
    }
}
