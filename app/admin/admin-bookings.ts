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
): Promise<AdminBookingsResult> {
    const bookings: AdminBooking[] = [];

    for (let from = 0; ; from += ADMIN_BOOKINGS_PAGE_SIZE) {
        const { data, error } = await client
            .from('bookings')
            .select(ADMIN_BOOKINGS_SELECT)
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
