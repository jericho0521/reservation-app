import { consumeBookingBudget, hashRequestValue, type BookingRequestContext } from './request-controls';
import { sendBookingConfirmationEmail } from './booking-confirmation-email';
import type { CreateBookingInput } from './booking-schema';
import { loadBookingAvailabilityResources } from './booking-availability';
import {
    isBookingDateWithinWindow,
    isCurrentBookingSlot,
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

export interface ValidateBookingScheduleOptions {
    /**
     * Staff recording a walk-in may book the hour that is already underway,
     * so the "slot has started" rule is skipped for them.
     */
    allowStartedSlot?: boolean;
    now?: Date;
}

export function validateBookingSchedule(
    input: CreateBookingInput,
    options: ValidateBookingScheduleOptions = {},
): ValidatedCreateBookingInput {
    const now = options.now ?? new Date();

    if (!isBookingDateWithinWindow(input.booking_date, now)) {
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
    if (isBookingSlotElapsed(input.booking_date, input.start_time, now) && !(options.allowStartedSlot && isCurrentBookingSlot(input.booking_date, input.start_time, now))) {
        throw new BookingCreationError('This booking time has already started or ended', 409);
    }

    return input as ValidatedCreateBookingInput;
}

export function validateSeatSelection(
    service: BookableService,
    input: CreateBookingInput,
): void {
    const requestedSeatLabels = input.seat_labels ?? [];

    if (service.total_seats !== 16 && requestedSeatLabels.length > 0) {
        throw new BookingCreationError('This service does not use numbered seats', 400);
    }
    if (new Set(requestedSeatLabels).size !== requestedSeatLabels.length || requestedSeatLabels.some(label => !/^RS(?:[1-9]|1[0-6])$/.test(label))) {
        throw new BookingCreationError('Invalid or duplicate seat labels', 400);
    }
    const requiresExplicitSeats = input.interface_type === 'form' || input.interface_type === 'walk_in';

    if (
        (requiresExplicitSeats || requestedSeatLabels.length > 0) &&
        service.total_seats === 16 &&
        requestedSeatLabels.length !== input.seats_booked
    ) {
        throw new BookingCreationError('Selected seat labels must match booked seats', 400);
    }
}

export async function createConfirmedBooking(
    service: BookableService,
    input: ValidatedCreateBookingInput,
    requestContext: BookingRequestContext,
) {
    const client = supabaseAdmin();
    const requestHash = hashRequestValue({ serviceId: service.id, ...input, user_email: input.user_email.trim().toLowerCase(), seat_labels: [...(input.seat_labels ?? [])].sort() });
    const loadDuplicate = async () => {
        const { data, error } = await client.from('bookings').select('*').eq('request_actor', requestContext.actor).eq('request_key', requestContext.key).maybeSingle();
        if (error) throw error;
        if (data && data.request_hash !== requestHash) throw new BookingCreationError('Idempotency key was already used for different booking details', 409);
        return data ? { ...data, email_requested: Boolean(data.user_email), email_sent: data.confirmation_email_sent === true } : null;
    };
    const duplicate = await loadDuplicate();
    if (duplicate) return duplicate;
    await consumeBookingBudget(requestContext, service.id, input.booking_date, input.user_email);
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
            request_actor: requestContext.actor, request_key: requestContext.key, request_hash: requestHash,
        })
        .select()
        .single();

    if (error) {
        if (error.code === '23505') { const duplicate = await loadDuplicate(); if (duplicate) return duplicate; }
        if (error.code === '23P01') throw new BookingCreationError('The selected capacity or seats are no longer available', 409);
        if (error.code === '23514') throw new BookingCreationError('Invalid booking schedule or seat selection', 400);
        throw error;
    }

    if (!booking.user_email) {
        return { ...booking, email_requested: false, email_sent: false };
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

    await client.from('bookings').update({ confirmation_email_sent: emailResult.sent }).eq('id', booking.id);
    return {
        ...booking,
        email_requested: true,
        email_sent: emailResult.sent,
    };
}
