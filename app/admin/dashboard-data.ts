export const ADMIN_BOOKINGS_SELECT = `
    id,
    user_name,
    user_email,
    booking_date,
    start_time,
    end_time,
    seats_booked,
    seat_labels,
    status,
    services (name)
`;

export type AdminFilter = 'all' | 'today' | 'upcoming' | 'completed' | 'cancelled';

export type AdminServiceRelation = { name: string } | { name: string }[] | null;

export interface AdminBooking {
    id: string;
    user_name: string;
    user_email: string;
    booking_date: string;
    start_time: string;
    end_time: string;
    seats_booked: number;
    seat_labels?: string[];
    status: string;
    services: AdminServiceRelation;
}

export interface BookingSummary {
    confirmed: number;
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

        if (booking.status === 'completed') {
            summary.completed += 1;
        }

        if (booking.status === 'cancelled') {
            summary.cancelled += 1;
        }

        return summary;
    }, {
        confirmed: 0,
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

        return booking.status === 'confirmed' || booking.status === 'pending';
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
