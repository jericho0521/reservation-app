import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { ADMIN_BOOKINGS_SELECT, getAdminBookingsLoadError, type AdminBooking } from './dashboard-data';
import AdminDashboard from './AdminDashboard';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        redirect('/admin/login');
    }

    const today = new Date().toISOString().split('T')[0];
    const [bookingsResult, todayCountResult] = await Promise.all([
        supabase
            .from('bookings')
            .select(ADMIN_BOOKINGS_SELECT)
            .order('booking_date', { ascending: false })
            .order('start_time', { ascending: false })
            .limit(50),
        supabase
            .from('bookings')
            .select('*', { count: 'exact', head: true })
            .eq('booking_date', today)
            .eq('status', 'confirmed'),
    ]);

    return (
        <AdminDashboard
            bookings={(bookingsResult.data || []) as AdminBooking[]}
            todayCount={todayCountResult.count || 0}
            userEmail={user.email || ''}
            today={today}
            loadError={getAdminBookingsLoadError(bookingsResult.error, todayCountResult.error)}
        />
    );
}
