import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import AdminDashboard from './AdminDashboard';

export default async function AdminPage() {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        redirect('/admin/login');
    }

    // Fetch bookings
    const { data: bookings } = await supabase
        .from('bookings')
        .select(`
            *,
            services (name)
        `)
        .order('booking_date', { ascending: false })
        .order('start_time', { ascending: false })
        .limit(50);

    // Fetch today's stats
    const today = new Date().toISOString().split('T')[0];
    const { count: todayCount } = await supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('booking_date', today)
        .eq('status', 'confirmed');

    return (
        <AdminDashboard
            bookings={bookings || []}
            todayCount={todayCount || 0}
            userEmail={user.email || ''}
        />
    );
}
