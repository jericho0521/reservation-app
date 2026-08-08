export interface BookingDetailsInput {
    user_name?: string;
    user_email?: string;
    user_phone?: string;
    seats_booked?: number;
    selected_seat_labels?: string[];
    requiresSeatSelection: boolean;
}

export type BookingDetailField = 'user_name' | 'user_email' | 'user_phone' | 'seats_booked';
export type BookingDetailErrors = Partial<Record<BookingDetailField, string>>;

export function validateBookingDetails(input: BookingDetailsInput): BookingDetailErrors {
    const errors: BookingDetailErrors = {};
    const name = input.user_name?.trim() ?? '';
    const email = input.user_email?.trim() ?? '';
    const phone = input.user_phone?.trim() ?? '';
    const phoneDigits = phone.replace(/\D/g, '');

    if (name.length < 2) {
        errors.user_name = 'Enter your full name.';
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.user_email = 'Enter a valid email address.';
    }

    if (phoneDigits.length < 7 || phoneDigits.length > 15) {
        errors.user_phone = 'Enter a valid phone number with 7 to 15 digits.';
    }

    if (!Number.isInteger(input.seats_booked) || (input.seats_booked ?? 0) < 1) {
        errors.seats_booked = input.requiresSeatSelection
            ? 'Select at least one seat.'
            : 'Book at least one seat.';
    } else if (
        input.requiresSeatSelection &&
        input.selected_seat_labels?.length !== input.seats_booked
    ) {
        errors.seats_booked = 'Your selected seats do not match the seat count.';
    }

    return errors;
}
