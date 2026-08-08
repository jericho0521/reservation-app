import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { getAdminBookingsLoadError, type AdminBooking } from './dashboard-data';
import { loadAllAdminBookings } from './admin-bookings';
import AdminDashboard from './AdminDashboard';
import { getBookingDateBounds } from '@/lib/booking-schedule';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        redirect('/admin/login');
    }

    const today = getBookingDateBounds().minDate;
    const [bookingsResult, todayCountResult] = await Promise.all([
        loadAllAdminBookings(supabase),
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
