import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { loadAdminBookingsPage } from '../admin-bookings';
import { BookingsTable } from '@/components/admin/BookingsTable';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'All bookings · Admin' };

export default async function AdminBookingsPage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const { data: isAdmin, error: roleError } = await supabase.rpc('is_admin');
    if (!user || roleError || isAdmin !== true) redirect('/admin/login');

    const result = await loadAdminBookingsPage(supabase);

    return (
        <BookingsTable
            initialBookings={result.data}
            initialCount={result.count}
            userEmail={user.email ?? ''}
            loadError={result.error?.message ?? null}
        />
    );
}
