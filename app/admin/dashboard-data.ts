export const ADMIN_BOOKINGS_SELECT = `
    id,
    user_name,
    user_email,
    user_phone,
    booking_date,
    start_time,
    end_time,
    seats_booked,
    seat_labels,
    status,
    interface_type,
    created_at,
    services (name)
`;

export const ADMIN_BOOKING_STATUSES = [
    'confirmed',
    'in_progress',
    'completed',
    'cancelled',
] as const;

export type AdminBookingStatus = typeof ADMIN_BOOKING_STATUSES[number];

export type AdminFilter = 'all' | 'today' | 'upcoming' | 'completed' | 'cancelled';

export const ADMIN_BOARD_LANES = [
    'upcoming',
    'in_progress',
    'done',
    'cancelled',
] as const;

export type AdminBoardLane = typeof ADMIN_BOARD_LANES[number];

export type AdminServiceRelation = { name: string } | { name: string }[] | null;

export interface AdminBooking {
    id: string;
    user_name: string;
    user_email: string;
    user_phone?: string;
    booking_date: string;
    start_time: string;
    end_time: string;
    seats_booked: number;
    seat_labels?: string[];
    status: AdminBookingStatus;
    interface_type: 'form' | 'chat';
    created_at: string;
    services: AdminServiceRelation;
}

export interface AdminBoardFilters {
    date: string;
    search: string;
    service: string;
}

export interface AdminTableFilters {
    search: string;
    service: string;
    status: AdminBookingStatus | 'all';
    dateFrom: string;
    dateTo: string;
}

const STATUS_TO_LANE: Record<AdminBookingStatus, AdminBoardLane> = {
    confirmed: 'upcoming',
    in_progress: 'in_progress',
    completed: 'done',
    cancelled: 'cancelled',
};

const LANE_TO_STATUS: Record<AdminBoardLane, AdminBookingStatus> = {
    upcoming: 'confirmed',
    in_progress: 'in_progress',
    done: 'completed',
    cancelled: 'cancelled',
};

export function getBookingLane(status: AdminBookingStatus): AdminBoardLane {
    return STATUS_TO_LANE[status];
}

export function getStatusForLane(lane: AdminBoardLane): AdminBookingStatus {
    return LANE_TO_STATUS[lane];
}

export function filterBookingsForBoard(
    bookings: AdminBooking[],
    filters: AdminBoardFilters,
): AdminBooking[] {
    const search = filters.search.trim().toLowerCase();

    return bookings
        .filter(booking => booking.booking_date === filters.date)
        .filter(booking => filters.service === 'all' || getServiceName(booking.services) === filters.service)
        .filter(booking => {
            if (!search) return true;

            return booking.user_name.toLowerCase().includes(search)
                || booking.user_email.toLowerCase().includes(search)
                || booking.user_phone?.toLowerCase().includes(search);
        })
        .sort((left, right) => left.start_time.localeCompare(right.start_time) || left.id.localeCompare(right.id));
}

export function groupBookingsByLane(bookings: AdminBooking[]): Record<AdminBoardLane, AdminBooking[]> {
    const grouped: Record<AdminBoardLane, AdminBooking[]> = {
        upcoming: [],
        in_progress: [],
        done: [],
        cancelled: [],
    };

    for (const booking of bookings) {
        grouped[getBookingLane(booking.status)].push(booking);
    }

    return grouped;
}

export function shiftDate(date: string, amount: number): string {
    const [year, month, day] = date.split('-').map(Number);
    const value = new Date(Date.UTC(year, month - 1, day + amount));
    return value.toISOString().slice(0, 10);
}

export function filterBookingsForTable(
    bookings: AdminBooking[],
    filters: AdminTableFilters,
): AdminBooking[] {
    const search = filters.search.trim().toLowerCase();

    return bookings
        .filter(booking => filters.status === 'all' || booking.status === filters.status)
        .filter(booking => filters.service === 'all' || getServiceName(booking.services) === filters.service)
        .filter(booking => !filters.dateFrom || booking.booking_date >= filters.dateFrom)
        .filter(booking => !filters.dateTo || booking.booking_date <= filters.dateTo)
        .filter(booking => {
            if (!search) return true;

            return booking.user_name.toLowerCase().includes(search)
                || booking.user_email.toLowerCase().includes(search)
                || booking.user_phone?.toLowerCase().includes(search);
        })
        .sort((left, right) => (
            right.booking_date.localeCompare(left.booking_date)
            || left.start_time.localeCompare(right.start_time)
            || left.id.localeCompare(right.id)
        ));
}

export interface BookingSummary {
    confirmed: number;
    inProgress: number;
    completed: number;
    cancelled: number;
}

interface QueryErrorLike {
    message?: string;
}

export function getAdminBookingsLoadError(
    bookingsError: QueryErrorLike | null | undefined,
    todayCountError: QueryErrorLike | null | undefined,
) {
    return bookingsError?.message || todayCountError?.message || null;
}

export function getBookingSummary(bookings: AdminBooking[]): BookingSummary {
    return bookings.reduce<BookingSummary>((summary, booking) => {
        if (booking.status === 'confirmed') {
            summary.confirmed += 1;
        }

        if (booking.status === 'in_progress') {
            summary.inProgress += 1;
        }

        if (booking.status === 'completed') {
            summary.completed += 1;
        }

        if (booking.status === 'cancelled') {
            summary.cancelled += 1;
        }

        return summary;
    }, {
        confirmed: 0,
        inProgress: 0,
        completed: 0,
        cancelled: 0,
    });
}

export function filterBookings(
    bookings: AdminBooking[],
    filter: AdminFilter,
    today: string,
): AdminBooking[] {
    return bookings.filter(booking => {
        if (filter === 'today') {
            return booking.booking_date === today && booking.status === 'confirmed';
        }

        if (filter === 'upcoming') {
            return booking.booking_date >= today && booking.status === 'confirmed';
        }

        if (filter === 'completed') {
            return booking.status === 'completed';
        }

        if (filter === 'cancelled') {
            return booking.status === 'cancelled';
        }

        return true;
    });
}

export function getServiceName(services: AdminServiceRelation): string {
    if (Array.isArray(services)) {
        return services[0]?.name || 'Unknown';
    }

    return services?.name || 'Unknown';
}

export function formatRefreshTime(
    value: Date | null,
    locale = 'en-MY',
    timeZone?: string,
) {
    if (!value) {
        return 'Updated just now';
    }

    return `Updated ${new Intl.DateTimeFormat(locale, {
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        timeZone,
    }).format(value)}`;
}
