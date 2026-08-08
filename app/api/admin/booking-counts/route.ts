import { NextResponse } from 'next/server';
import { requireAuthenticatedSupabase } from '@/app/api/api-utils';
import { loadAdminBookingCounts } from '@/app/admin/admin-booking-counts';
import { getBookingDateBounds } from '@/lib/booking-schedule';

export async function GET() {
    const auth = await requireAuthenticatedSupabase();

    if (auth.response) {
        return auth.response;
    }

    const operatingDate = getBookingDateBounds().minDate;
    const result = await loadAdminBookingCounts(auth.supabase, operatingDate);

    if (result.error) {
        console.error('Failed to load admin booking counts:', result.error);
        return NextResponse.json(
            { error: 'Failed to load booking counts' },
            { status: 500 },
        );
    }

    return NextResponse.json(result.data);
}
