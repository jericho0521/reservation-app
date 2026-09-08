import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { ADMIN_BOOKINGS_SELECT, type AdminBooking } from './dashboard-data';

const ADMIN_BOOKINGS_PAGE_SIZE = 1_000;

type AdminBookingsClient = Pick<SupabaseClient, 'from'>;

interface AdminBookingsResult {
    data: AdminBooking[];
    error: PostgrestError | null;
}

export async function loadAllAdminBookings(
    client: AdminBookingsClient,
    date?: string,
    signal?: AbortSignal,
): Promise<AdminBookingsResult> {
    const bookings: AdminBooking[] = [];

    for (let from = 0; ; from += ADMIN_BOOKINGS_PAGE_SIZE) {
        let query = client.from('bookings').select(ADMIN_BOOKINGS_SELECT);
        if (date) query = query.eq('booking_date', date);
        if (signal) query = query.abortSignal(signal);
        const { data, error } = await query
            .order('created_at', { ascending: false })
            .order('id', { ascending: false })
            .range(from, from + ADMIN_BOOKINGS_PAGE_SIZE - 1);

        if (error) {
            return { data: [], error };
        }

        const page = (data ?? []) as AdminBooking[];
        bookings.push(...page);

        if (page.length < ADMIN_BOOKINGS_PAGE_SIZE) {
            return { data: bookings, error: null };
        }
    }
}

export async function loadAdminBookingsPage(client: AdminBookingsClient, filters: {
    page?: number; search?: string; status?: string; service?: string; dateFrom?: string; dateTo?: string;
} = {}, signal?: AbortSignal) {
    const page = Math.max(1, Math.floor(filters.page ?? 1));
    const { buildBookingSearchFilter, normalizeBookingSearchTerm } = await import('@/app/api/bookings/search-utils');
    let query = client.from('bookings').select(
        filters.service && filters.service !== 'all' ? ADMIN_BOOKINGS_SELECT.replace(/services\s*\(/, 'services!inner(') : ADMIN_BOOKINGS_SELECT,
        { count: 'exact' },
    );
    if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status);
    if (filters.service && filters.service !== 'all') query = query.eq('services.name', filters.service);
    if (filters.dateFrom) query = query.gte('booking_date', filters.dateFrom);
    if (filters.dateTo) query = query.lte('booking_date', filters.dateTo);
    const search = normalizeBookingSearchTerm(filters.search ?? null);
    if (search) query = query.or(buildBookingSearchFilter(search));
    if (signal) query = query.abortSignal(signal);
    const { data, error, count } = await query.order('created_at', { ascending: false }).order('id', { ascending: false }).range((page - 1) * 25, page * 25 - 1);
    return { data: (data ?? []) as unknown as AdminBooking[], error, count: count ?? 0 };
}
