import assert from 'node:assert/strict';
import test from 'node:test';
import { extractPreparedBookingAction, resolveToolCalls } from './tool-loop';

test('resolveToolCalls runs independent tool calls in parallel', async () => {
    let activeCount = 0;
    let maxActiveCount = 0;

    const toolMessages = await resolveToolCalls(
        [
            {
                id: 'tool-1',
                function: {
                    name: 'get_services',
                    arguments: '{}',
                },
            },
            {
                id: 'tool-2',
                function: {
                    name: 'check_availability',
                    arguments: JSON.stringify({ service_name: 'Racing Simulator', date: '2026-03-12' }),
                },
            },
        ],
        async (name, args) => {
            activeCount += 1;
            maxActiveCount = Math.max(maxActiveCount, activeCount);
            await new Promise(resolve => setTimeout(resolve, 5));
            activeCount -= 1;

            return { name, args };
        },
    );

    assert.equal(maxActiveCount, 2);
    assert.deepEqual(toolMessages, [
        {
            role: 'tool',
            tool_call_id: 'tool-1',
            content: JSON.stringify({ name: 'get_services', args: {} }),
        },
        {
            role: 'tool',
            tool_call_id: 'tool-2',
            content: JSON.stringify({
                name: 'check_availability',
                args: { service_name: 'Racing Simulator', date: '2026-03-12' },
            }),
        },
    ]);
});

test('extractPreparedBookingAction reads booking details from tool calls', () => {
    const action = extractPreparedBookingAction([
        {
            id: 'tool-1',
            function: {
                name: 'prepare_booking',
                arguments: JSON.stringify({
                    service_name: 'Racing Simulator',
                    date: '2026-03-12',
                    start_time: '20:00',
                    seats: 2,
                    user_name: 'Alex',
                    user_email: 'alex@example.com',
                }),
            },
        },
    ]);

    assert.deepEqual(action, {
        type: 'booking_confirmation',
        data: {
            service: 'Racing Simulator',
            date: '2026-03-12',
            time: '20:00',
            seats: 2,
            name: 'Alex',
            email: 'alex@example.com',
        },
    });
});
