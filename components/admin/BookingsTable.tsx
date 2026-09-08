'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, Search, X } from 'lucide-react';
import { createClient } from '@/lib/supabase-browser';
import { loadAdminBookingsPage } from '@/app/admin/admin-bookings';
import {
    ADMIN_BOOKING_STATUSES,
    ADMIN_STATUS_LABELS as STATUS_LABELS,
    formatRefreshTime,
    getBookingSourceLabel,
    getServiceName,
    type AdminBooking,
    type AdminBookingStatus,
} from '@/app/admin/dashboard-data';
import { AdminShell } from './AdminShell';
import { BookingCancellationDialog } from './BookingCancellationDialog';
import { BookingDetailsDrawer } from './BookingDetailsDrawer';

const PAGE_SIZE = 25;
const BOOKING_DATE_FORMATTER = new Intl.DateTimeFormat('en-MY', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
});

interface BookingsTableProps {
    initialBookings: AdminBooking[];
    initialCount: number;
    userEmail: string;
    loadError: string | null;
}

export function BookingsTable({ initialBookings, initialCount, userEmail, loadError }: BookingsTableProps) {
    const [bookings, setBookings] = useState(initialBookings);
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState<AdminBookingStatus | 'all'>('all');
    const [service, setService] = useState('all');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [page, setPage] = useState(1);
    const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
    const [pendingCancellation, setPendingCancellation] = useState<AdminBooking | null>(null);
    const [updatingId, setUpdatingId] = useState<string | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
    const [notice, setNotice] = useState<{ tone: 'error' | 'success'; message: string } | null>(null);
    const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);

    const [services, setServices] = useState<string[]>([]);
    const [totalCount, setTotalCount] = useState(initialCount);
    const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
    const pageBookings = bookings;
    const requestRef = useRef<AbortController | null>(null);
    useEffect(() => {
        void fetch('/api/services').then(response => response.json()).then((data: { name: string }[]) => setServices(data.map(service => service.name))).catch(() => undefined);
    }, []);
    const selectedBooking = bookings.find(booking => booking.id === selectedBookingId) ?? null;

    useEffect(() => {
        setPage(1);
    }, [dateFrom, dateTo, search, service, status]);

    useEffect(() => {
        if (page > totalPages) setPage(totalPages);
    }, [page, totalPages]);

    const refreshBookings = useCallback(async () => {
        requestRef.current?.abort();
        const controller = new AbortController();
        requestRef.current = controller;
        setIsRefreshing(true);
        supabaseRef.current ??= createClient();
        const result = await loadAdminBookingsPage(supabaseRef.current, { page, search, status, service, dateFrom, dateTo }, controller.signal);
        if (controller.signal.aborted) return;

        if (result.error) {
            setNotice({ tone: 'error', message: 'Bookings could not be refreshed. Try again.' });
        } else {
            setBookings(result.data);
            setTotalCount(result.count);
            setLastRefresh(new Date());
        }
        setIsRefreshing(false);
    }, [page, search, status, service, dateFrom, dateTo]);

    useEffect(() => {
        const timer = window.setTimeout(() => void refreshBookings(), 200);
        return () => { window.clearTimeout(timer); requestRef.current?.abort(); };
    }, [refreshBookings]);

    useEffect(() => {
        setLastRefresh(new Date());
        supabaseRef.current ??= createClient();
        const supabase = supabaseRef.current;
        let refreshTimer: ReturnType<typeof setTimeout>;
        const channel = supabase
            .channel('admin-bookings-table')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => {
                clearTimeout(refreshTimer);
                refreshTimer = setTimeout(() => void refreshBookings(), 200);
            })
            .subscribe();

        return () => {
            clearTimeout(refreshTimer);
            void supabase.removeChannel(channel);
        };
    }, [refreshBookings]);

    const commitStatusChange = useCallback(async (booking: AdminBooking, nextStatus: AdminBookingStatus) => {
        if (booking.status === nextStatus || updatingId) return;

        const previousStatus = booking.status;
        setPendingCancellation(null);
        setUpdatingId(booking.id);
        setNotice(null);
        setBookings(current => current.map(item => (
            item.id === booking.id ? { ...item, status: nextStatus } : item
        )));

        try {
            const response = await fetch(`/api/bookings/${booking.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: nextStatus }),
            });
            if (!response.ok) throw new Error('Status update failed');
            setNotice({ tone: 'success', message: `${booking.user_name} moved to ${STATUS_LABELS[nextStatus]}.` });
        } catch {
            setBookings(current => current.map(item => (
                item.id === booking.id ? { ...item, status: previousStatus } : item
            )));
            setNotice({ tone: 'error', message: 'The booking could not be moved. Its previous status was restored.' });
        } finally {
            setUpdatingId(null);
        }
    }, [updatingId]);

    const requestStatusChange = useCallback((booking: AdminBooking, nextStatus: AdminBookingStatus) => {
        if (nextStatus === 'cancelled') {
            setPendingCancellation(booking);
            return;
        }
        void commitStatusChange(booking, nextStatus);
    }, [commitStatusChange]);

    const closeDetails = useCallback(() => setSelectedBookingId(null), []);
    const cancelCancellation = useCallback(() => setPendingCancellation(null), []);
    const confirmCancellation = useCallback((booking: AdminBooking) => {
        void commitStatusChange(booking, 'cancelled');
    }, [commitStatusChange]);

    const hasFilters = Boolean(search || status !== 'all' || service !== 'all' || dateFrom || dateTo);
    const clearFilters = () => {
        setSearch('');
        setStatus('all');
        setService('all');
        setDateFrom('');
        setDateTo('');
    };

    return (
        <AdminShell userEmail={userEmail}>
            <div className="admin-dashboard admin-bookings-page">
                <header className="admin-page-header">
                    <div>
                        <span className="admin-eyebrow">Operations</span>
                        <h1>All bookings</h1>
                        <p>Every booking, past and future. Change a status directly in the table, or click a name for full details.</p>
                    </div>
                    <button type="button" className="admin-secondary-button" onClick={() => void refreshBookings()} disabled={isRefreshing}>
                        <RefreshCw className={isRefreshing ? 'is-spinning' : ''} aria-hidden="true" />
                        {isRefreshing ? 'Refreshing' : 'Refresh'}
                    </button>
                </header>

                <div className="admin-table-toolbar">
                    <label className="admin-search-control">
                        <Search aria-hidden="true" />
                        <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Name, email, or phone" aria-label="Search all bookings" />
                        {search && <button type="button" onClick={() => setSearch('')} aria-label="Clear search"><X aria-hidden="true" /></button>}
                    </label>
                    <select value={status} onChange={event => setStatus(event.target.value as AdminBookingStatus | 'all')} aria-label="Filter by status">
                        <option value="all">All statuses</option>
                        {ADMIN_BOOKING_STATUSES.map(item => <option key={item} value={item}>{STATUS_LABELS[item]}</option>)}
                    </select>
                    <select value={service} onChange={event => setService(event.target.value)} aria-label="Filter by service">
                        <option value="all">All services</option>
                        {services.map(item => <option key={item} value={item}>{item}</option>)}
                    </select>
                    <label className="admin-date-filter"><span>From</span><input type="date" value={dateFrom} onChange={event => setDateFrom(event.target.value)} aria-label="Booking date from" /></label>
                    <label className="admin-date-filter"><span>To</span><input type="date" value={dateTo} onChange={event => setDateTo(event.target.value)} aria-label="Booking date to" /></label>
                    {hasFilters && (
                        <button type="button" className="admin-clear-filters" onClick={clearFilters}>Clear filters</button>
                    )}
                </div>

                {(loadError || notice) && (
                    <div className={`admin-notice ${loadError || notice?.tone === 'error' ? 'is-error' : 'is-success'}`} role="status">
                        <span>{loadError || notice?.message}</span>
                        {notice && <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss message"><X aria-hidden="true" /></button>}
                    </div>
                )}

                <div className="admin-table-meta">
                    <span>
                        {totalCount} booking{totalCount === 1 ? '' : 's'}
                        {hasFilters ? ' match your filters' : ' in total'}
                    </span>
                    <span>{formatRefreshTime(lastRefresh)}</span>
                </div>

                <div className="admin-table-frame">
                    <div className="admin-table-scroll">
                        <table className="admin-bookings-table">
                            <thead>
                                <tr>
                                    <th>Customer</th>
                                    <th>Service</th>
                                    <th>Date</th>
                                    <th>Time</th>
                                    <th>Seats</th>
                                    <th>Source</th>
                                    <th>Status</th>
                                    <th><span className="sr-only">Actions</span></th>
                                </tr>
                            </thead>
                            <tbody>
                                {pageBookings.length === 0 ? (
                                    <tr><td colSpan={8} className="admin-table-empty">{hasFilters ? 'No bookings match these filters.' : 'No bookings yet.'}</td></tr>
                                ) : pageBookings.map(booking => (
                                    <tr key={booking.id}>
                                        <td>
                                            <button type="button" className="admin-customer-link" onClick={() => setSelectedBookingId(booking.id)}>{booking.user_name}</button>
                                            <span>{booking.user_email || booking.user_phone || 'No contact details'}</span>
                                        </td>
                                        <td>{getServiceName(booking.services)}</td>
                                        <td>{BOOKING_DATE_FORMATTER.format(new Date(`${booking.booking_date}T00:00:00`))}</td>
                                        <td className="tabular-nums">{booking.start_time.slice(0, 5)}–{booking.end_time.slice(0, 5)}</td>
                                        <td>{booking.seat_labels?.length ? booking.seat_labels.join(', ') : booking.seats_booked}</td>
                                        <td>{getBookingSourceLabel(booking.interface_type)}</td>
                                        <td>
                                            <select
                                                value={booking.status}
                                                onChange={event => requestStatusChange(booking, event.target.value as AdminBookingStatus)}
                                                disabled={updatingId === booking.id}
                                                className={`admin-inline-status status-${booking.status}`}
                                                aria-label={`Status for ${booking.user_name}`}
                                            >
                                                {ADMIN_BOOKING_STATUSES.map(item => <option key={item} value={item}>{STATUS_LABELS[item]}</option>)}
                                            </select>
                                        </td>
                                        <td><button type="button" className="admin-view-button" onClick={() => setSelectedBookingId(booking.id)}>View</button></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <footer className="admin-table-pagination">
                        <span>Page {page} of {totalPages}</span>
                        <div>
                            <button type="button" onClick={() => setPage(value => Math.max(1, value - 1))} disabled={page === 1} aria-label="Previous page"><ChevronLeft aria-hidden="true" /></button>
                            <button type="button" onClick={() => setPage(value => Math.min(totalPages, value + 1))} disabled={page === totalPages} aria-label="Next page"><ChevronRight aria-hidden="true" /></button>
                        </div>
                    </footer>
                </div>
            </div>

            <BookingDetailsDrawer
                booking={selectedBooking}
                isUpdating={updatingId === selectedBooking?.id}
                onClose={closeDetails}
                onMove={requestStatusChange}
            />
            <BookingCancellationDialog
                booking={pendingCancellation}
                onCancel={cancelCancellation}
                onConfirm={confirmCancellation}
            />
        </AdminShell>
    );
}
