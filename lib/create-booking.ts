import { sendBookingConfirmationEmail } from './booking-confirmation-email';
import type { CreateBookingInput } from './booking-schema';
import { loadBookingAvailabilityResources } from './booking-availability';
import {
    isBookingDateWithinWindow,
    isBookingSlotElapsed,
    isValidBookingTimeRange,
} from './booking-schedule';
import {
    getAvailableSeatsForRange,
    getBookingsForRange,
    getConflictingSeatLabels,
} from './reservation-capacity';
import { getMaintenanceSeatConflicts } from './seat-maintenance';
import { supabaseAdmin } from './supabase-admin';
import type { Service } from '@/types';

export type BookableService = Pick<Service, 'id' | 'name' | 'total_seats'>;

declare const validatedSchedule: unique symbol;
export type ValidatedCreateBookingInput = CreateBookingInput & {
    readonly [validatedSchedule]: true;
};

export class BookingCreationError extends Error {
    constructor(
        message: string,
        readonly status: number,
        readonly details?: Record<string, unknown>,
    ) {
        super(message);
    }
}

export function validateBookingSchedule(
    input: CreateBookingInput,
): ValidatedCreateBookingInput {
    if (!isBookingDateWithinWindow(input.booking_date)) {
        throw new BookingCreationError(
            'Booking date must be between today and 30 days from today',
            400,
        );
    }
    if (!isValidBookingTimeRange(input.start_time, input.end_time)) {
        throw new BookingCreationError(
            'Booking time must be a continuous range within operating hours',
            400,
        );
    }
    if (isBookingSlotElapsed(input.booking_date, input.start_time)) {
        throw new BookingCreationError('This booking time has already started or ended', 409);
    }

    return input as ValidatedCreateBookingInput;
}

export function validateSeatSelection(
    service: BookableService,
    input: CreateBookingInput,
): void {
    const requestedSeatLabels = input.seat_labels ?? [];

    if (
        input.interface_type === 'form' &&
        service.total_seats === 16 &&
        requestedSeatLabels.length !== input.seats_booked
    ) {
        throw new BookingCreationError('Selected seat labels must match booked seats', 400);
    }
}

export async function createConfirmedBooking(
    service: BookableService,
    input: ValidatedCreateBookingInput,
) {
    const { bookings, maintenanceSeatLabels } = await loadBookingAvailabilityResources(
        service.id,
        input.booking_date,
    );
    const requestedSeatLabels = input.seat_labels ?? [];
    validateSeatSelection(service, input);

    const availableSeats = getAvailableSeatsForRange(
        service.total_seats,
        bookings,
        input.start_time,
        input.end_time,
        maintenanceSeatLabels,
    );

    if (input.seats_booked > availableSeats) {
        throw new BookingCreationError('Not enough seats available', 409, {
            available_seats: availableSeats,
        });
    }

    const maintenanceConflicts = getMaintenanceSeatConflicts(
        requestedSeatLabels,
        maintenanceSeatLabels,
    );
    if (maintenanceConflicts.length > 0) {
        throw new BookingCreationError('Some selected seats are under maintenance', 409, {
            seat_labels: maintenanceConflicts,
        });
    }

    const overlappingBookings = getBookingsForRange(
        bookings,
        input.start_time,
        input.end_time,
    );
    const bookedSeatConflicts = getConflictingSeatLabels(
        overlappingBookings,
        requestedSeatLabels,
    );
    if (bookedSeatConflicts.length > 0) {
        throw new BookingCreationError('Some selected seats are no longer available', 409, {
            seat_labels: bookedSeatConflicts,
        });
    }

    const { data: booking, error } = await supabaseAdmin()
        .from('bookings')
        .insert({
            service_id: service.id,
            ...input,
            status: 'confirmed',
        })
        .select()
        .single();

    if (error) {
        throw error;
    }

    const emailResult = await sendBookingConfirmationEmail({
        bookingId: booking.id,
        interfaceType: booking.interface_type,
        customerName: booking.user_name,
        customerEmail: booking.user_email,
        customerPhone: booking.user_phone,
        serviceName: service.name,
        bookingDate: booking.booking_date,
        startTime: booking.start_time,
        endTime: booking.end_time,
        seatsBooked: booking.seats_booked,
        seatLabels: booking.seat_labels,
    });

    return {
        ...booking,
        email_sent: emailResult.sent,
    };
}
