import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadAllAdminBookings } from './admin-bookings';

test('loadAllAdminBookings returns every booking with newest-created first', async () => {
    const bookings = Array.from({ length: 1_051 }, (_, index) => ({
        id: `booking-${index}`,
        created_at: new Date(Date.UTC(2026, 7, 3, 12, 0, 0) - index * 1_000).toISOString(),
    }));
    const ranges: Array<[number, number]> = [];
    const orders: Array<[string, { ascending: boolean }]> = [];
    const client = {
        from(table: string) {
            assert.equal(table, 'bookings');
            return {
                select() {
                    return {
                        order(column: string, options: { ascending: boolean }) {
                            orders.push([column, options]);
                            return {
                                order(nextColumn: string, nextOptions: { ascending: boolean }) {
                                    orders.push([nextColumn, nextOptions]);
                                    return {
                                        async range(from: number, to: number) {
                                            ranges.push([from, to]);
                                            return {
                                                data: bookings.slice(from, to + 1),
                                                error: null,
                                            };
                                        },
                                    };
                                },
                            };
                        },
                    };
                },
            };
        },
    };

    const result = await loadAllAdminBookings(client as unknown as Pick<SupabaseClient, 'from'>);

    assert.equal(result.error, null);
    assert.equal(result.data.length, 1_051);
    assert.equal(result.data[0].id, 'booking-0');
    assert.equal(result.data.at(-1)?.id, 'booking-1050');
    assert.deepEqual(orders, [
        ['created_at', { ascending: false }],
        ['id', { ascending: false }],
        ['created_at', { ascending: false }],
        ['id', { ascending: false }],
    ]);
    assert.deepEqual(ranges, [
        [0, 999],
        [1_000, 1_999],
    ]);
});

test('table pages apply filters before a bounded database range', async () => {
  const { loadAdminBookingsPage } = await import('./admin-bookings');
  const filters: unknown[] = [];
  let range: number[] = [];
  const query = {
    select: (...args: unknown[]) => { filters.push(args); return query; },
    eq: (...args: unknown[]) => { filters.push(args); return query; },
    gte: (...args: unknown[]) => { filters.push(args); return query; },
    lte: (...args: unknown[]) => { filters.push(args); return query; },
    order: () => query,
    range: async (from: number, to: number) => { range = [from, to]; return { data: [], count: 51, error: null }; },
  };
  const result = await loadAdminBookingsPage({ from: () => query } as unknown as SupabaseClient, {
    page: 2, status: 'confirmed', service: 'Racing Simulator', dateFrom: '2026-09-01',
  });
  assert.deepEqual(range, [25, 49]);
  assert.equal(result.count, 51);
  assert.ok(JSON.stringify(filters).includes('services!inner('));
  assert.ok(JSON.stringify(filters).includes('confirmed'));
});
