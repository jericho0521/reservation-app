'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X, RotateCcw, LogOut, RefreshCw, Search, XCircle } from 'lucide-react';
import { Sidebar } from '@/components/admin/Sidebar';
import { filterBookings, formatRefreshTime, getBookingSummary, getServiceName, type AdminBooking, type AdminFilter } from './dashboard-data';
import { listAdminReservations, updateReservationStatus } from '@/lib/reservation-platform-client';
import { getAdminAuthClient } from '@/lib/admin-auth-client';

interface AdminDashboardProps {
    bookings: AdminBooking[];
    todayCount: number;
    userEmail: string;
    today: string;
    loadError: string | null;
}

const STATUS_COLOR_MAP: Record<string, string> = {
    confirmed: 'bg-green-500/20 text-green-400 border-green-500/30',
    cancelled: 'bg-red-500/20 text-red-400 border-red-500/30',
    completed: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
};

const FILTER_OPTIONS: AdminFilter[] = ['all', 'today', 'upcoming', 'completed', 'cancelled'];

export default function AdminDashboard({ bookings: initialBookings, todayCount, userEmail, today, loadError }: AdminDashboardProps) {
    const [bookings, setBookings] = useState(initialBookings);
    const [filter, setFilter] = useState<AdminFilter>('all');
    const [isUpdating, setIsUpdating] = useState<string | null>(null);
    const router = useRouter();
    const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const searchTermRef = useRef(searchTerm);
    const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const searchRequestIdRef = useRef(0);
    const searchAbortRef = useRef<AbortController | null>(null);
    searchTermRef.current = searchTerm;
    const summary = useMemo(() => getBookingSummary(bookings), [bookings]);
    const filteredBookings = useMemo(() => {
        let results = bookings;
        if (searchTerm.trim()) {
            const term = searchTerm.trim().toLowerCase();
            results = results.filter(b =>
                b.user_name.toLowerCase().includes(term) ||
                b.user_email.toLowerCase().includes(term) ||
                (b.user_phone && b.user_phone.toLowerCase().includes(term))
            );
        }
        return filterBookings(results, filter, today);
    }, [bookings, filter, today, searchTerm]);
    const dateFormatter = useMemo(() => new Intl.DateTimeFormat('en-MY', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
    }), []);

    const refreshBookings = useCallback(async () => {
        setIsRefreshing(true);

        try {
            const data = await listAdminReservations();
            if (!searchTermRef.current.trim()) {
                setBookings(data);
                setLastRefresh(new Date());
            }
        } catch (error) {
            console.error('Failed to refresh bookings:', error);
            alert(error instanceof Error ? `Failed to refresh bookings: ${error.message}` : 'Failed to refresh bookings');
            setIsRefreshing(false);
            return;
        }

        setIsRefreshing(false);
    }, []);

    const performSearch = useCallback(async (term: string) => {
        searchRequestIdRef.current += 1;
        const requestId = searchRequestIdRef.current;
        searchAbortRef.current?.abort();
        searchAbortRef.current = null;

        if (!term.trim()) {
            try {
                await refreshBookings();
            } finally {
                if (requestId === searchRequestIdRef.current) {
                    setIsSearching(false);
                }
            }
            return;
        }

        const controller = new AbortController();
        searchAbortRef.current = controller;
        setIsSearching(true);
        try {
            const data = await listAdminReservations({ search: term, signal: controller.signal });

            if (requestId !== searchRequestIdRef.current) {
                return;
            }

            setBookings(data);
            setLastRefresh(new Date());
        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') {
                return;
            }
            console.error('Search failed:', error);
        } finally {
            if (requestId === searchRequestIdRef.current) {
                setIsSearching(false);
                searchAbortRef.current = null;
            }
        }
    }, [refreshBookings]);

    // Auto-refresh every 30 seconds (disabled while searching)
    useEffect(() => {
        if (searchTerm.trim()) return;
        setLastRefresh(new Date());
        const interval = setInterval(refreshBookings, 30000);
        return () => clearInterval(interval);
    }, [refreshBookings, searchTerm]);

    // Debounced search
    useEffect(() => {
        if (searchTimerRef.current) {
            clearTimeout(searchTimerRef.current);
        }
        searchTimerRef.current = setTimeout(() => {
            performSearch(searchTerm);
        }, 300);
        return () => {
            if (searchTimerRef.current) {
                clearTimeout(searchTimerRef.current);
            }
            searchAbortRef.current?.abort();
        };
    }, [searchTerm, performSearch]);

    const handleLogout = async () => {
        const { errorMessage } = await getAdminAuthClient().signOut();

        if (errorMessage) {
            console.error('Failed to sign out:', errorMessage);
        }

        router.push('/admin/login');
        router.refresh();
    };

    const updateBookingStatus = async (bookingId: string, newStatus: string) => {
        setIsUpdating(bookingId);
        try {
            await updateReservationStatus(bookingId, newStatus);

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

    const getStatusColor = (status: string) => {
        return STATUS_COLOR_MAP[status] ?? 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    };

    return (
        <div className="min-h-screen bg-racing-dark">
            {/* New Expandable Sidebar */}
            <Sidebar title="Admin Panel" subtitle={userEmail} />

            {/* Main Layout with margin for sidebar */}
            <div className="ml-[76px] transition-all duration-300">
                {/* Header */}
                <header className="border-b border-white/10 bg-white/5 sticky top-0 z-10 backdrop-blur-md">
                    <div className="container mx-auto px-6 py-4 flex justify-between items-center">
                        <div>
                            <h1 className="text-2xl font-bold font-heading">Bookings Management</h1>
                            <p className="text-sm text-gray-400">Manage all your reservations</p>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2 text-sm text-gray-400">
                                <button
                                    onClick={refreshBookings}
                                    disabled={isRefreshing}
                                    className="flex items-center gap-1 px-3 py-1.5 border border-white/20 rounded-lg hover:bg-white/10 transition-colors disabled:opacity-50"
                                >
                                    <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                                    {isRefreshing ? 'Refreshing...' : 'Refresh'}
                                </button>
                                <span className="text-xs">
                                    {formatRefreshTime(lastRefresh)}
                                </span>
                            </div>
                            <button
                                onClick={handleLogout}
                                className="flex items-center gap-2 px-4 py-2 text-sm border border-white/20 rounded-lg hover:bg-white/10 transition-colors"
                            >
                                <LogOut className="w-4 h-4" />
                                Sign Out
                            </button>
                        </div>
                    </div>
                </header>

                {/* Main Content Area */}
                <main className="container mx-auto px-6 py-8 space-y-8">
                    {loadError && (
                        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
                            <p className="font-semibold text-red-100">Failed to load bookings</p>
                            <p className="mt-1">{loadError}</p>
                        </div>
                    )}

                    {/* Stats */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="glass-panel p-4 rounded-xl border border-white/10">
                            <p className="text-xs text-gray-400 mb-1">Today</p>
                            <p className="text-2xl font-bold text-neon">{todayCount}</p>
                        </div>
                        <div className="glass-panel p-4 rounded-xl border border-white/10">
                            <p className="text-xs text-gray-400 mb-1">Confirmed</p>
                            <p className="text-2xl font-bold text-green-400">
                                {summary.confirmed}
                            </p>
                        </div>
                        <div className="glass-panel p-4 rounded-xl border border-white/10">
                            <p className="text-xs text-gray-400 mb-1">Completed</p>
                            <p className="text-2xl font-bold text-blue-400">
                                {summary.completed}
                            </p>
                        </div>
                        <div className="glass-panel p-4 rounded-xl border border-white/10">
                            <p className="text-xs text-gray-400 mb-1">Cancelled</p>
                            <p className="text-2xl font-bold text-red-400">
                                {summary.cancelled}
                            </p>
                        </div>
                    </div>

                    {/* Search */}
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="w-5 h-5 text-gray-400" />
                        </div>
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Search by name, email, or phone..."
                            className="w-full pl-10 pr-10 py-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder-gray-500 focus:border-neon focus:outline-none focus:ring-1 focus:ring-neon transition-colors"
                        />
                        {searchTerm && (
                            <button
                                onClick={() => setSearchTerm('')}
                                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-white transition-colors"
                            >
                                {isSearching ? (
                                    <span className="w-4 h-4 border-2 border-gray-400 border-t-neon rounded-full animate-spin" />
                                ) : (
                                    <XCircle className="w-5 h-5" />
                                )}
                            </button>
                        )}
                    </div>

                    {/* Filter */}
                    <div className="flex flex-wrap gap-2">
                        {FILTER_OPTIONS.map(f => (
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
                                                {searchTerm ? 'No bookings match your search' : 'No bookings found'}
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredBookings.map(booking => (
                                            <tr key={booking.id} className="hover:bg-white/5">
                                                <td className="px-4 py-3">
                                                    <div className="font-medium text-sm">{booking.user_name}</div>
                                                    <div className="text-xs text-gray-400">{booking.user_email}</div>
                                                    {booking.user_phone && (
                                                        <div className="text-xs text-gray-500">{booking.user_phone}</div>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-sm">
                                                    {getServiceName(booking.services)}
                                                </td>
                                                <td className="px-4 py-3 text-sm">
                                                    {dateFormatter.format(new Date(booking.booking_date))}
                                                </td>
                                                <td className="px-4 py-3 text-sm">
                                                    {booking.start_time} - {booking.end_time}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="text-sm font-medium">{booking.seats_booked}</div>
                                                    {booking.seat_labels && booking.seat_labels.length > 0 && (
                                                        <div className="text-xs text-neon mt-0.5">
                                                            {booking.seat_labels.join(', ')}
                                                        </div>
                                                    )}
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
        </div>
    );
}
