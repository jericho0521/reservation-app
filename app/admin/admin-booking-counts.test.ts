import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadAdminBookingCounts } from './admin-booking-counts';

test('loadAdminBookingCounts returns live counts using operating-date filters', async () => {
    const queries: Array<{
        table: string;
        filters: Array<[operator: string, column: string, value: string]>;
    }> = [];
    const expectedCounts = [42, 3, 8, 20];

    const client = {
        from(table: string) {
            const query = {
                table,
                filters: [] as Array<[string, string, string]>,
            };
            queries.push(query);

            const builder = {
                select(_columns: string, options: { count: string; head: boolean }) {
                    assert.deepEqual(options, { count: 'exact', head: true });
                    return builder;
                },
                eq(column: string, value: string) {
                    query.filters.push(['eq', column, value]);
                    return builder;
                },
                gte(column: string, value: string) {
                    query.filters.push(['gte', column, value]);
                    return builder;
                },
                then(resolve: (value: { count: number; error: null }) => void) {
                    resolve({ count: expectedCounts[queries.indexOf(query)], error: null });
                },
            };

            return builder;
        },
    };

    const result = await loadAdminBookingCounts(
        client as unknown as Pick<SupabaseClient, 'from'>,
        '2026-08-08',
    );

    assert.deepEqual(result, {
        data: {
            all: 42,
            today: 3,
            upcoming: 8,
            completed: 20,
        },
        error: null,
    });
    assert.deepEqual(queries.map(query => query.filters), [
        [],
        [
            ['eq', 'booking_date', '2026-08-08'],
            ['eq', 'status', 'confirmed'],
        ],
        [
            ['gte', 'booking_date', '2026-08-08'],
            ['eq', 'status', 'confirmed'],
        ],
        [['eq', 'status', 'completed']],
    ]);
});
