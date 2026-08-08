import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';

export interface AdminBookingCounts {
    all: number;
    today: number;
    upcoming: number;
    completed: number;
}

type AdminBookingsClient = Pick<SupabaseClient, 'from'>;

interface AdminBookingCountsResult {
    data: AdminBookingCounts | null;
    error: PostgrestError | null;
}

export async function loadAdminBookingCounts(
    client: AdminBookingsClient,
    operatingDate: string,
): Promise<AdminBookingCountsResult> {
    const countBookings = () => client
        .from('bookings')
        .select('id', { count: 'exact', head: true });

    const [all, today, upcoming, completed] = await Promise.all([
        countBookings(),
        countBookings()
            .eq('booking_date', operatingDate)
            .eq('status', 'confirmed'),
        countBookings()
            .gte('booking_date', operatingDate)
            .eq('status', 'confirmed'),
        countBookings().eq('status', 'completed'),
    ]);

    const error = all.error ?? today.error ?? upcoming.error ?? completed.error;
    if (error) {
        return { data: null, error };
    }

    return {
        data: {
            all: all.count ?? 0,
            today: today.count ?? 0,
            upcoming: upcoming.count ?? 0,
            completed: completed.count ?? 0,
        },
        error: null,
    };
}
