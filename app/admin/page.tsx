import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { loadAdminReservations } from '@/lib/admin-reservations-loader';
import AdminDashboard from './AdminDashboard';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        redirect('/admin/login');
    }

    const today = new Date().toISOString().split('T')[0];
    const { bookings, todayCount, loadError } = await loadAdminReservations({ today });

    return (
        <AdminDashboard
            bookings={bookings}
            todayCount={todayCount}
            userEmail={user.email || ''}
            today={today}
            loadError={loadError}
        />
    );
}
