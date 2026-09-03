import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { loadAllAdminBookings } from '../admin-bookings';
import { BookingsTable } from '@/components/admin/BookingsTable';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'All bookings · Admin' };

export default async function AdminBookingsPage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) redirect('/admin/login');

    const result = await loadAllAdminBookings(supabase);

    return (
        <BookingsTable
            initialBookings={result.data}
            userEmail={user.email ?? ''}
            loadError={result.error?.message ?? null}
        />
    );
}
