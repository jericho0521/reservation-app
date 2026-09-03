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
    const bookingsResult = await loadAllAdminBookings(supabase);

    return (
        <AdminDashboard
            bookings={(bookingsResult.data || []) as AdminBooking[]}
            userEmail={user.email || ''}
            today={today}
            loadError={getAdminBookingsLoadError(bookingsResult.error, null)}
        />
    );
}
