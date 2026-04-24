import type { ChartProps } from '@/components/analytics/renderer/spec-types';

const PRICING: Record<string, number> = {
    'Racing Simulator': 15,
    'Playstation 5': 30,
};

const DAY_ORDER = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export interface AnalyticsBookingRecord {
    booking_date: string;
    start_time: string;
    seats_booked: number;
    status: string;
    services: { name: string } | { name: string }[] | null;
}

interface ServiceSnapshot {
    name: string;
    bookings: number;
    seats: number;
    revenue: number;
    completed: number;
    confirmed: number;
    cancelled: number;
}

export interface AnalyticsSnapshot {
    period: {
        start?: string;
        end?: string;
        label: string;
    };
    totals: {
        bookings: number;
        confirmed: number;
        completed: number;
        cancelled: number;
        seats: number;
    };
    revenue: {
        total: number;
        earned: number;
        pending: number;
        lost: number;
    };
    services: ServiceSnapshot[];
    bookingsByDay: Array<{ label: string; value: number }>;
    bookingsByHour: Array<{ label: string; value: number }>;
    statusCounts: Array<{ label: string; value: number }>;
    revenueByDay: Array<{ date: string; revenue: number }>;
    revenueByService: Array<{ label: string; revenue: number; bookings: number }>;
    topLevelCharts: {
        revenueTrend: ChartProps;
        revenueShare: ChartProps;
        bookingsByService: ChartProps;
        weekdayDemand: ChartProps;
        hourlyDemand: ChartProps;
        statusBreakdown: ChartProps;
    };
}

export function getServiceName(services: AnalyticsBookingRecord['services']): string {
    if (Array.isArray(services)) {
        return services[0]?.name || 'Unknown';
    }

    return services?.name || 'Unknown';
}

function formatPeriodLabel(startDate?: string, endDate?: string) {
    if (startDate && endDate) {
        return `${startDate} to ${endDate}`;
    }

    if (startDate) {
        return `From ${startDate}`;
    }

    if (endDate) {
        return `Until ${endDate}`;
    }

    return 'Selected period';
}

export function buildAnalyticsSnapshot(
    bookings: AnalyticsBookingRecord[],
    startDate?: string,
    endDate?: string,
): AnalyticsSnapshot {
    const serviceMap = new Map<string, ServiceSnapshot>();
    const dayMap = new Map<string, number>();
    const hourMap = new Map<string, number>();
    const statusMap = new Map<string, number>();
    const revenueByDate = new Map<string, number>();

    const snapshot: AnalyticsSnapshot = {
        period: {
            start: startDate,
            end: endDate,
            label: formatPeriodLabel(startDate, endDate),
        },
        totals: {
            bookings: bookings.length,
            confirmed: 0,
            completed: 0,
            cancelled: 0,
            seats: 0,
        },
        revenue: {
            total: 0,
            earned: 0,
            pending: 0,
            lost: 0,
        },
        services: [],
        bookingsByDay: [],
        bookingsByHour: [],
        statusCounts: [],
        revenueByDay: [],
        revenueByService: [],
        topLevelCharts: {
            revenueTrend: {
                type: 'line',
                title: 'Revenue Over Time',
                subtitle: 'Daily revenue across the selected period',
                xKey: 'date',
                yKey: 'revenue',
                format: 'currency',
                legend: true,
                data: [],
                series: [{ key: 'revenue', name: 'Revenue', color: '#39FF14' }],
                emptyMessage: 'No revenue data for this period.',
            },
            revenueShare: {
                type: 'pie',
                title: 'Revenue by Service',
                subtitle: 'Share of earned and pending revenue by service',
                xKey: 'label',
                yKey: 'revenue',
                format: 'currency',
                legend: true,
                data: [],
                series: [{ key: 'revenue', name: 'Revenue', color: '#60A5FA' }],
                emptyMessage: 'No service revenue available.',
            },
            bookingsByService: {
                type: 'bar',
                title: 'Bookings by Service',
                subtitle: 'Completed and confirmed bookings in the selected period',
                xKey: 'label',
                yKey: 'bookings',
                format: 'number',
                legend: true,
                data: [],
                series: [{ key: 'bookings', name: 'Bookings', color: '#C084FC' }],
                emptyMessage: 'No bookings available for this period.',
            },
            weekdayDemand: {
                type: 'bar',
                title: 'Bookings by Day of Week',
                subtitle: 'Demand patterns across the selected period',
                xKey: 'label',
                yKey: 'value',
                format: 'number',
                legend: false,
                data: [],
                series: [{ key: 'value', name: 'Bookings', color: '#F97316' }],
                emptyMessage: 'No weekday demand data available.',
            },
            hourlyDemand: {
                type: 'bar',
                title: 'Bookings by Hour',
                subtitle: 'Peak booking times during the selected period',
                xKey: 'label',
                yKey: 'value',
                format: 'number',
                legend: false,
                data: [],
                series: [{ key: 'value', name: 'Bookings', color: '#22D3EE' }],
                emptyMessage: 'No hourly demand data available.',
            },
            statusBreakdown: {
                type: 'pie',
                title: 'Booking Status Mix',
                subtitle: 'Confirmed, completed, and cancelled booking share',
                xKey: 'label',
                yKey: 'value',
                format: 'number',
                legend: true,
                data: [],
                series: [{ key: 'value', name: 'Bookings', color: '#A855F7' }],
                emptyMessage: 'No booking status data available.',
            },
        },
    };

    for (const booking of bookings) {
        const serviceName = getServiceName(booking.services);
        const price = PRICING[serviceName] || 0;
        const bookingRevenue = booking.seats_booked * price;

        snapshot.totals.seats += booking.seats_booked;

        if (booking.status === 'confirmed') {
            snapshot.totals.confirmed += 1;
            snapshot.revenue.pending += bookingRevenue;
            snapshot.revenue.total += bookingRevenue;
            revenueByDate.set(booking.booking_date, (revenueByDate.get(booking.booking_date) ?? 0) + bookingRevenue);
        }

        if (booking.status === 'completed') {
            snapshot.totals.completed += 1;
            snapshot.revenue.earned += bookingRevenue;
            snapshot.revenue.total += bookingRevenue;
            revenueByDate.set(booking.booking_date, (revenueByDate.get(booking.booking_date) ?? 0) + bookingRevenue);
        }

        if (booking.status === 'cancelled') {
            snapshot.totals.cancelled += 1;
            snapshot.revenue.lost += bookingRevenue;
            revenueByDate.set(booking.booking_date, revenueByDate.get(booking.booking_date) ?? 0);
        }

        const serviceStats = serviceMap.get(serviceName) ?? {
            name: serviceName,
            bookings: 0,
            seats: 0,
            revenue: 0,
            completed: 0,
            confirmed: 0,
            cancelled: 0,
        };

        serviceStats.seats += booking.seats_booked;

        if (booking.status === 'completed') {
            serviceStats.completed += 1;
            serviceStats.bookings += 1;
            serviceStats.revenue += bookingRevenue;
        }

        if (booking.status === 'confirmed') {
            serviceStats.confirmed += 1;
            serviceStats.bookings += 1;
            serviceStats.revenue += bookingRevenue;
        }

        if (booking.status === 'cancelled') {
            serviceStats.cancelled += 1;
        }

        serviceMap.set(serviceName, serviceStats);
        statusMap.set(booking.status, (statusMap.get(booking.status) ?? 0) + 1);

        const dayOfWeek = new Date(booking.booking_date).toLocaleDateString('en-US', { weekday: 'long' });
        dayMap.set(dayOfWeek, (dayMap.get(dayOfWeek) ?? 0) + 1);

        const hour = booking.start_time.slice(0, 5);
        hourMap.set(hour, (hourMap.get(hour) ?? 0) + 1);
    }

    snapshot.services = [...serviceMap.values()].sort((left, right) => right.bookings - left.bookings);
    snapshot.bookingsByDay = DAY_ORDER
        .filter(day => dayMap.has(day))
        .map(day => ({ label: day, value: dayMap.get(day) ?? 0 }));
    snapshot.bookingsByHour = [...hourMap.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([label, value]) => ({ label, value }));
    snapshot.statusCounts = [...statusMap.entries()].map(([label, value]) => ({ label, value }));
    snapshot.revenueByDay = [...revenueByDate.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([date, revenue]) => ({ date, revenue }));
    snapshot.revenueByService = snapshot.services
        .filter(service => service.revenue > 0)
        .map(service => ({
            label: service.name,
            revenue: service.revenue,
            bookings: service.bookings,
        }));

    snapshot.topLevelCharts.revenueTrend.data = snapshot.revenueByDay;
    snapshot.topLevelCharts.revenueShare.data = snapshot.revenueByService;
    snapshot.topLevelCharts.bookingsByService.data = snapshot.revenueByService.map(service => ({
        label: service.label,
        bookings: service.bookings,
        revenue: service.revenue,
    }));
    snapshot.topLevelCharts.weekdayDemand.data = snapshot.bookingsByDay;
    snapshot.topLevelCharts.hourlyDemand.data = snapshot.bookingsByHour;
    snapshot.topLevelCharts.statusBreakdown.data = snapshot.statusCounts;

    return snapshot;
}
