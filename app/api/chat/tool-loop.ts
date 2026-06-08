import { extractPreparedBookingActionFromToolCalls } from "@project-play/reservation-chat-core";

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
    return extractPreparedBookingActionFromToolCalls(toolCalls);
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
