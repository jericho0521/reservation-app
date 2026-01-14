'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import { Check, X, RotateCcw, LogOut } from 'lucide-react';

interface Booking {
    id: string;
    user_name: string;
    user_email: string;
    booking_date: string;
    start_time: string;
    end_time: string;
    seats_booked: number;
    status: string;
    services: { name: string } | null;
}

interface AdminDashboardProps {
    bookings: Booking[];
    todayCount: number;
    userEmail: string;
}

export default function AdminDashboard({ bookings: initialBookings, todayCount, userEmail }: AdminDashboardProps) {
    const [bookings, setBookings] = useState(initialBookings);
    const [filter, setFilter] = useState<'all' | 'today' | 'upcoming' | 'completed' | 'cancelled'>('all');
    const [isUpdating, setIsUpdating] = useState<string | null>(null);
    const router = useRouter();
    const supabase = createClient();

    const handleLogout = async () => {
        await supabase.auth.signOut();
        router.push('/admin/login');
        router.refresh();
    };

    const updateBookingStatus = async (bookingId: string, newStatus: string) => {
        setIsUpdating(bookingId);
        try {
            const { error } = await supabase
                .from('bookings')
                .update({ status: newStatus })
                .eq('id', bookingId);

            if (error) throw error;

            setBookings(prev =>
                prev.map(b => b.id === bookingId ? { ...b, status: newStatus } : b)
            );
        } catch (error) {
            console.error('Failed to update status:', error);
            alert('Failed to update booking status');
        } finally {
            setIsUpdating(null);
        }
    };

    const today = new Date().toISOString().split('T')[0];

    const filteredBookings = bookings.filter(booking => {
        if (filter === 'today') return booking.booking_date === today && booking.status === 'confirmed';
        if (filter === 'upcoming') return booking.booking_date >= today && booking.status === 'confirmed';
        if (filter === 'completed') return booking.status === 'completed';
        if (filter === 'cancelled') return booking.status === 'cancelled';
        return booking.status === 'confirmed' || booking.status === 'pending';
    });

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'confirmed': return 'bg-green-500/20 text-green-400 border-green-500/30';
            case 'cancelled': return 'bg-red-500/20 text-red-400 border-red-500/30';
            case 'completed': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
            case 'pending': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
            default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
        }
    };

    return (
        <div className="min-h-screen bg-racing-dark">
            {/* Header */}
            <header className="border-b border-white/10 bg-white/5">
                <div className="container mx-auto px-6 py-4 flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold font-heading">Admin Dashboard</h1>
                        <p className="text-sm text-gray-400">Logged in as {userEmail}</p>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-2 px-4 py-2 text-sm border border-white/20 rounded-lg hover:bg-white/10 transition-colors"
                    >
                        <LogOut className="w-4 h-4" />
                        Sign Out
                    </button>
                </div>
            </header>

            <main className="container mx-auto px-6 py-8">
                {/* Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    <div className="glass-panel p-4 rounded-xl border border-white/10">
                        <p className="text-xs text-gray-400 mb-1">Today</p>
                        <p className="text-2xl font-bold text-neon">{todayCount}</p>
                    </div>
                    <div className="glass-panel p-4 rounded-xl border border-white/10">
                        <p className="text-xs text-gray-400 mb-1">Confirmed</p>
                        <p className="text-2xl font-bold text-green-400">
                            {bookings.filter(b => b.status === 'confirmed').length}
                        </p>
                    </div>
                    <div className="glass-panel p-4 rounded-xl border border-white/10">
                        <p className="text-xs text-gray-400 mb-1">Completed</p>
                        <p className="text-2xl font-bold text-blue-400">
                            {bookings.filter(b => b.status === 'completed').length}
                        </p>
                    </div>
                    <div className="glass-panel p-4 rounded-xl border border-white/10">
                        <p className="text-xs text-gray-400 mb-1">Cancelled</p>
                        <p className="text-2xl font-bold text-red-400">
                            {bookings.filter(b => b.status === 'cancelled').length}
                        </p>
                    </div>
                </div>

                {/* Filter */}
                <div className="flex flex-wrap gap-2 mb-6">
                    {(['all', 'today', 'upcoming', 'completed', 'cancelled'] as const).map(f => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`px-4 py-2 text-sm rounded-lg transition-colors ${filter === f
                                ? 'bg-neon text-racing-dark'
                                : 'bg-white/5 border border-white/20 hover:bg-white/10'
                                }`}
                        >
                            {f.charAt(0).toUpperCase() + f.slice(1)}
                        </button>
                    ))}
                </div>

                {/* Bookings Table */}
                <div className="glass-panel rounded-xl border border-white/10 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-white/5">
                                <tr>
                                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Customer</th>
                                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Service</th>
                                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Date</th>
                                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Time</th>
                                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Seats</th>
                                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Status</th>
                                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/10">
                                {filteredBookings.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                                            No bookings found
                                        </td>
                                    </tr>
                                ) : (
                                    filteredBookings.map(booking => (
                                        <tr key={booking.id} className="hover:bg-white/5">
                                            <td className="px-4 py-3">
                                                <div className="font-medium text-sm">{booking.user_name}</div>
                                                <div className="text-xs text-gray-400">{booking.user_email}</div>
                                            </td>
                                            <td className="px-4 py-3 text-sm">
                                                {booking.services?.name || 'Unknown'}
                                            </td>
                                            <td className="px-4 py-3 text-sm">
                                                {new Date(booking.booking_date).toLocaleDateString('en-MY', {
                                                    weekday: 'short',
                                                    month: 'short',
                                                    day: 'numeric'
                                                })}
                                            </td>
                                            <td className="px-4 py-3 text-sm">
                                                {booking.start_time} - {booking.end_time}
                                            </td>
                                            <td className="px-4 py-3 text-sm">
                                                {booking.seats_booked}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`px-2 py-1 text-xs rounded-full border ${getStatusColor(booking.status)}`}>
                                                    {booking.status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                {booking.status === 'confirmed' && (
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => updateBookingStatus(booking.id, 'completed')}
                                                            disabled={isUpdating === booking.id}
                                                            className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded hover:bg-blue-500/30 disabled:opacity-50"
                                                        >
                                                            <Check className="w-3 h-3" />
                                                            {isUpdating === booking.id ? '...' : 'Complete'}
                                                        </button>
                                                        <button
                                                            onClick={() => updateBookingStatus(booking.id, 'cancelled')}
                                                            disabled={isUpdating === booking.id}
                                                            className="flex items-center gap-1 px-2 py-1 text-xs bg-red-500/20 text-red-400 border border-red-500/30 rounded hover:bg-red-500/30 disabled:opacity-50"
                                                        >
                                                            <X className="w-3 h-3" />
                                                            {isUpdating === booking.id ? '...' : 'Cancel'}
                                                        </button>
                                                    </div>
                                                )}
                                                {(booking.status === 'completed' || booking.status === 'cancelled') && (
                                                    <button
                                                        onClick={() => updateBookingStatus(booking.id, 'confirmed')}
                                                        disabled={isUpdating === booking.id}
                                                        className="flex items-center gap-1 px-2 py-1 text-xs bg-white/10 text-gray-300 border border-white/20 rounded hover:bg-white/20 disabled:opacity-50"
                                                    >
                                                        <RotateCcw className="w-3 h-3" />
                                                        {isUpdating === booking.id ? '...' : 'Restore'}
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>
        </div>
    );
}
