'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    DndContext,
    DragOverlay,
    KeyboardSensor,
    PointerSensor,
    closestCorners,
    useDraggable,
    useDroppable,
    useSensor,
    useSensors,
    type DragEndEvent,
    type DragStartEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import {
    CalendarDays,
    ChevronLeft,
    ChevronRight,
    Circle,
    GripVertical,
    MoreHorizontal,
    MoveHorizontal,
    RefreshCw,
    Search,
    UserPlus,
    Users,
    X,
} from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';
import { AdminShell } from '@/components/admin/AdminShell';
import { BookingDetailsDrawer } from '@/components/admin/BookingDetailsDrawer';
import { BookingCancellationDialog } from '@/components/admin/BookingCancellationDialog';
import {
    ADMIN_BOARD_LANES,
    ADMIN_STATUS_LABELS as STATUS_LABELS,
    filterBookingsForBoard,
    formatRefreshTime,
    getBookingSourceLabel,
    getServiceName,
    getStatusForLane,
    groupBookingsByLane,
    shiftDate,
    type AdminBoardLane,
    type AdminBooking,
    type AdminBookingStatus,
} from './dashboard-data';
import { loadAllAdminBookings } from './admin-bookings';

interface AdminDashboardProps {
    bookings: AdminBooking[];
    userEmail: string;
    today: string;
    loadError: string | null;
}

const LANE_META: Record<AdminBoardLane, { label: string; description: string }> = {
    upcoming: { label: 'Upcoming', description: 'Confirmed, customer not here yet' },
    in_progress: { label: 'In progress', description: 'Customer is playing now' },
    done: { label: 'Done', description: 'Session finished' },
    cancelled: { label: 'Cancelled', description: 'Will not happen' },
};

function BookingCard({
    booking,
    isUpdating,
    onOpen,
    onMove,
}: {
    booking: AdminBooking;
    isUpdating: boolean;
    onOpen: (booking: AdminBooking) => void;
    onMove: (booking: AdminBooking, status: AdminBookingStatus) => void;
}) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: booking.id,
        disabled: isUpdating,
    });
    const menuRef = useRef<HTMLDetailsElement>(null);
    const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;

    const handleMenuToggle = () => {
        const menu = menuRef.current;
        if (!menu?.open) return;

        const closeOnOutsideClick = (event: PointerEvent) => {
            if (!menu.contains(event.target as Node)) menu.open = false;
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') menu.open = false;
        };
        const cleanup = () => {
            document.removeEventListener('pointerdown', closeOnOutsideClick);
            document.removeEventListener('keydown', closeOnEscape);
            menu.removeEventListener('toggle', cleanup);
        };

        document.addEventListener('pointerdown', closeOnOutsideClick);
        document.addEventListener('keydown', closeOnEscape);
        menu.addEventListener('toggle', cleanup, { once: true });
    };

    return (
        <article
            ref={setNodeRef}
            style={style}
            className={`admin-booking-card ${isDragging ? 'is-dragging' : ''} ${isUpdating ? 'is-updating' : ''}`}
        >
            <button
                type="button"
                className="admin-card-open"
                onClick={() => onOpen(booking)}
                aria-label={`Open booking for ${booking.user_name}`}
            />
            <div className="admin-card-topline">
                <span className="admin-card-time tabular-nums">
                    {booking.start_time.slice(0, 5)}–{booking.end_time.slice(0, 5)}
                </span>
                <div className="admin-card-controls">
                    <button
                        type="button"
                        className="admin-card-drag"
                        aria-label={`Drag booking for ${booking.user_name}`}
                        title="Drag to another column"
                        {...listeners}
                        {...attributes}
                    >
                        <GripVertical aria-hidden="true" />
                    </button>
                    <details ref={menuRef} className="admin-card-menu" onToggle={handleMenuToggle}>
                        <summary aria-label={`Change status for ${booking.user_name}`} title="Change status">
                            <MoreHorizontal aria-hidden="true" />
                        </summary>
                        <div className="admin-card-menu-popover">
                            <span>Move to</span>
                            {(Object.keys(STATUS_LABELS) as AdminBookingStatus[])
                                .filter(status => status !== booking.status)
                                .map(status => (
                                    <button
                                        key={status}
                                        type="button"
                                        onClick={() => onMove(booking, status)}
                                    >
                                        {STATUS_LABELS[status]}
                                    </button>
                                ))}
                        </div>
                    </details>
                </div>
            </div>

            <h3>{booking.user_name}</h3>
            <p className="admin-card-service">{getServiceName(booking.services)}</p>

            <div className="admin-card-meta">
                <span><Users aria-hidden="true" />{booking.seats_booked} seat{booking.seats_booked === 1 ? '' : 's'}</span>
                <span>{getBookingSourceLabel(booking.interface_type)}</span>
            </div>

            {booking.seat_labels?.length ? (
                <p className="admin-card-seats">{booking.seat_labels.join(' · ')}</p>
            ) : null}
        </article>
    );
}

function BoardColumn({
    lane,
    bookings,
    updatingId,
    onOpen,
    onMove,
}: {
    lane: AdminBoardLane;
    bookings: AdminBooking[];
    updatingId: string | null;
    onOpen: (booking: AdminBooking) => void;
    onMove: (booking: AdminBooking, status: AdminBookingStatus) => void;
}) {
    const { setNodeRef, isOver } = useDroppable({ id: `lane:${lane}` });
    const meta = LANE_META[lane];

    return (
        <section ref={setNodeRef} className={`admin-board-column lane-${lane} ${isOver ? 'is-over' : ''}`}>
            <header className="admin-column-header">
                <div>
                    <div className="admin-column-title">
                        <Circle aria-hidden="true" />
                        <h2>{meta.label}</h2>
                        <span>{bookings.length}</span>
                    </div>
                    <p>{meta.description}</p>
                </div>
            </header>
            <div className="admin-column-cards">
                {bookings.length === 0 ? (
                    <div className="admin-column-empty">Nothing {lane === 'in_progress' ? 'in progress' : meta.label.toLowerCase()}</div>
                ) : bookings.map(booking => (
                    <BookingCard
                        key={booking.id}
                        booking={booking}
                        isUpdating={updatingId === booking.id}
                        onOpen={onOpen}
                        onMove={onMove}
                    />
                ))}
            </div>
        </section>
    );
}

export default function AdminDashboard({
    bookings: initialBookings,
    userEmail,
    today,
    loadError,
}: AdminDashboardProps) {
    const [bookings, setBookings] = useState(initialBookings);
    const [selectedDate, setSelectedDate] = useState(today);
    const [search, setSearch] = useState('');
    const [service, setService] = useState('all');
    const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
    const [activeBookingId, setActiveBookingId] = useState<string | null>(null);
    const [updatingId, setUpdatingId] = useState<string | null>(null);
    const [pendingCancellation, setPendingCancellation] = useState<AdminBooking | null>(null);
    const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [notice, setNotice] = useState<{ tone: 'error' | 'success'; message: string } | null>(null);
    const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(KeyboardSensor),
    );

    const services = useMemo(() => (
        [...new Set(bookings.map(booking => getServiceName(booking.services)))].sort()
    ), [bookings]);
    const visibleBookings = useMemo(() => filterBookingsForBoard(bookings, {
        date: selectedDate,
        search,
        service,
    }), [bookings, search, selectedDate, service]);
    const lanes = useMemo(() => groupBookingsByLane(visibleBookings), [visibleBookings]);
    const selectedBooking = useMemo(
        () => bookings.find(booking => booking.id === selectedBookingId) ?? null,
        [bookings, selectedBookingId],
    );
    const activeBooking = useMemo(
        () => bookings.find(booking => booking.id === activeBookingId) ?? null,
        [activeBookingId, bookings],
    );

    const refreshBookings = useCallback(async () => {
        setIsRefreshing(true);
        supabaseRef.current ??= createClient();
        const result = await loadAllAdminBookings(supabaseRef.current);

        if (result.error) {
            setNotice({ tone: 'error', message: 'Bookings could not be refreshed. Try again.' });
        } else {
            setBookings(result.data);
            setLastRefresh(new Date());
        }
        setIsRefreshing(false);
    }, []);

    useEffect(() => {
        setLastRefresh(new Date());
        const interval = window.setInterval(() => void refreshBookings(), 30_000);
        return () => window.clearInterval(interval);
    }, [refreshBookings]);

    useEffect(() => {
        supabaseRef.current ??= createClient();
        const supabase = supabaseRef.current;
        const channel = supabase
            .channel('admin-bookings-board')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => {
                void refreshBookings();
            })
            .subscribe();

        return () => {
            void supabase.removeChannel(channel);
        };
    }, [refreshBookings]);

    const commitStatusChange = useCallback(async (
        booking: AdminBooking,
        status: AdminBookingStatus,
    ) => {
        if (booking.status === status || updatingId) return;

        const previousStatus = booking.status;
        setPendingCancellation(null);
        setUpdatingId(booking.id);
        setNotice(null);
        setBookings(current => current.map(item => (
            item.id === booking.id ? { ...item, status } : item
        )));

        try {
            const response = await fetch(`/api/bookings/${booking.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status }),
            });

            if (!response.ok) throw new Error('Status update failed');
            setNotice({ tone: 'success', message: `${booking.user_name} moved to ${STATUS_LABELS[status]}.` });
        } catch {
            setBookings(current => current.map(item => (
                item.id === booking.id ? { ...item, status: previousStatus } : item
            )));
            setNotice({ tone: 'error', message: 'The booking could not be moved. Its previous status was restored.' });
        } finally {
            setUpdatingId(null);
        }
    }, [updatingId]);

    const requestStatusChange = useCallback((
        booking: AdminBooking,
        status: AdminBookingStatus,
    ) => {
        if (status === 'cancelled') {
            setPendingCancellation(booking);
            return;
        }
        void commitStatusChange(booking, status);
    }, [commitStatusChange]);

    const openBooking = useCallback((booking: AdminBooking) => {
        setSelectedBookingId(booking.id);
    }, []);
    const closeDetails = useCallback(() => setSelectedBookingId(null), []);
    const cancelCancellation = useCallback(() => setPendingCancellation(null), []);
    const confirmCancellation = useCallback((booking: AdminBooking) => {
        void commitStatusChange(booking, 'cancelled');
    }, [commitStatusChange]);

    const handleDragStart = ({ active }: DragStartEvent) => {
        setActiveBookingId(String(active.id));
    };

    const handleDragEnd = ({ active, over }: DragEndEvent) => {
        setActiveBookingId(null);
        if (!over || !String(over.id).startsWith('lane:')) return;

        const booking = bookings.find(item => item.id === active.id);
        if (!booking) return;

        const lane = String(over.id).replace('lane:', '') as AdminBoardLane;
        requestStatusChange(booking, getStatusForLane(lane));
    };

    const selectedDateLabel = new Intl.DateTimeFormat('en-MY', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    }).format(new Date(`${selectedDate}T00:00:00`));
    const isToday = selectedDate === today;
    const hasFilters = search.trim() !== '' || service !== 'all';
    const clearFilters = () => {
        setSearch('');
        setService('all');
    };

    return (
        <AdminShell userEmail={userEmail}>
            <div className="admin-dashboard">
                <header className="admin-page-header">
                    <div>
                        <span className="admin-eyebrow">Operations</span>
                        <h1>Daily board</h1>
                        <p>One day at a time. Drag a card between columns, or use its menu, to update the booking status.</p>
                    </div>
                    <div className="admin-header-actions">
                        <button
                            type="button"
                            className="admin-secondary-button"
                            onClick={() => void refreshBookings()}
                            disabled={isRefreshing}
                        >
                            <RefreshCw className={isRefreshing ? 'is-spinning' : ''} aria-hidden="true" />
                            {isRefreshing ? 'Refreshing' : 'Refresh'}
                        </button>
                        <Link href="/admin/walk-in" className="admin-primary-button" title="Record a customer who arrived in person">
                            <UserPlus aria-hidden="true" />
                            Add walk-in
                        </Link>
                    </div>
                </header>

                <div className="admin-board-toolbar">
                    <div className="admin-date-control">
                        <button type="button" onClick={() => setSelectedDate(date => shiftDate(date, -1))} aria-label="Previous day">
                            <ChevronLeft aria-hidden="true" />
                        </button>
                        <label title="Pick a date">
                            <CalendarDays aria-hidden="true" />
                            <span>{selectedDateLabel}</span>
                            {isToday && <em className="admin-today-tag">Today</em>}
                            <input
                                type="date"
                                value={selectedDate}
                                onChange={event => setSelectedDate(event.target.value)}
                                aria-label="Selected booking date"
                            />
                        </label>
                        <button type="button" onClick={() => setSelectedDate(date => shiftDate(date, 1))} aria-label="Next day">
                            <ChevronRight aria-hidden="true" />
                        </button>
                        {!isToday && (
                            <button type="button" className="admin-today-button" onClick={() => setSelectedDate(today)}>Back to today</button>
                        )}
                    </div>

                    <div className="admin-board-filters">
                        <label className="admin-search-control">
                            <Search aria-hidden="true" />
                            <input
                                value={search}
                                onChange={event => setSearch(event.target.value)}
                                placeholder="Search name, email, or phone"
                                aria-label="Search bookings"
                            />
                            {search && (
                                <button type="button" onClick={() => setSearch('')} aria-label="Clear search">
                                    <X aria-hidden="true" />
                                </button>
                            )}
                        </label>
                        <select value={service} onChange={event => setService(event.target.value)} aria-label="Filter by service">
                            <option value="all">All services</option>
                            {services.map(item => <option key={item} value={item}>{item}</option>)}
                        </select>
                    </div>
                </div>

                {(loadError || notice) && (
                    <div className={`admin-notice ${loadError || notice?.tone === 'error' ? 'is-error' : 'is-success'}`} role="status">
                        <span>{loadError || notice?.message}</span>
                        {notice && (
                            <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss message"><X aria-hidden="true" /></button>
                        )}
                    </div>
                )}

                <div className="admin-board-context">
                    <span className="admin-board-count">
                        {visibleBookings.length === 0
                            ? (hasFilters ? 'No bookings match your filters' : `No bookings ${isToday ? 'today' : 'on this day'}`)
                            : `${visibleBookings.length} booking${visibleBookings.length === 1 ? '' : 's'} ${isToday ? 'today' : 'on this day'}`}
                    </span>
                    {hasFilters && (
                        <button type="button" className="admin-inline-link" onClick={clearFilters}>Clear filters</button>
                    )}
                    <span className="admin-board-hint"><MoveHorizontal aria-hidden="true" />Drag cards between columns to change status</span>
                    <span className="admin-board-refresh">{formatRefreshTime(lastRefresh)}</span>
                </div>

                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCorners}
                    onDragStart={handleDragStart}
                    onDragCancel={() => setActiveBookingId(null)}
                    onDragEnd={handleDragEnd}
                >
                    <div className="admin-board" aria-label={`Bookings for ${selectedDateLabel}`}>
                        {ADMIN_BOARD_LANES.map(lane => (
                            <BoardColumn
                                key={lane}
                                lane={lane}
                                bookings={lanes[lane]}
                                updatingId={updatingId}
                                onOpen={openBooking}
                                onMove={requestStatusChange}
                            />
                        ))}
                    </div>
                    <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }}>
                        {activeBooking ? (
                            <div className="admin-booking-card admin-drag-overlay">
                                <span className="admin-card-time tabular-nums">{activeBooking.start_time.slice(0, 5)}</span>
                                <h3>{activeBooking.user_name}</h3>
                                <p className="admin-card-service">{getServiceName(activeBooking.services)}</p>
                            </div>
                        ) : null}
                    </DragOverlay>
                </DndContext>
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
