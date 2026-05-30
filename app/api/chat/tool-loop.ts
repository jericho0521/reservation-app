export interface ToolCall {
    id: string;
    function: {
        name: string;
        arguments?: string;
    };
}

export interface ToolMessage {
    role: 'tool';
    tool_call_id: string;
    content: string;
}

interface BookingConfirmationData {
    service: string;
    date: string;
    time: string;
    seats: number;
    name: string;
    email: string;
    phone: string;
}

export function extractPreparedBookingAction(toolCalls: ToolCall[]): {
    type: 'booking_confirmation';
    data: BookingConfirmationData;
} | null {
    for (const toolCall of toolCalls) {
        if (toolCall.function.name !== 'prepare_booking') {
            continue;
        }

        try {
            const args = JSON.parse(toolCall.function.arguments || '{}');
            const {
                service_name: service,
                date,
                start_time: time,
                seats,
                user_name: name,
                user_email: email,
                user_phone: phone,
            } = args;

            if (
                typeof service !== 'string' ||
                typeof date !== 'string' ||
                typeof time !== 'string' ||
                typeof seats !== 'number' ||
                typeof name !== 'string' ||
                typeof email !== 'string' ||
                typeof phone !== 'string'
            ) {
                return null;
            }

            return {
                type: 'booking_confirmation',
                data: {
                    service,
                    date,
                    time,
                    seats,
                    name,
                    email,
                    phone,
                },
            };
        } catch {
            return null;
        }
    }

    return null;
}

export async function resolveToolCalls(
    toolCalls: ToolCall[],
    executeTool: (name: string, args: Record<string, unknown>) => Promise<unknown>,
): Promise<ToolMessage[]> {
    return Promise.all(toolCalls.map(async toolCall => {
        let args: Record<string, unknown> = {};

        try {
            args = JSON.parse(toolCall.function.arguments || '{}') as Record<string, unknown>;
        } catch {
            args = {};
        }

        const result = await executeTool(toolCall.function.name, args);

        return {
            role: 'tool' as const,
            tool_call_id: toolCall.id,
            content: JSON.stringify(result),
        };
    }));
}
