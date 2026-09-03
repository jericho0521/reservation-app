import { z } from 'zod';

/**
 * Where a booking came from. `form` and `chat` are created by customers on
 * the public site; `walk_in` is recorded by staff for customers who arrive
 * in person, so the time and seats are blocked for everyone else.
 */
export const BOOKING_INTERFACE_TYPES = ['form', 'chat', 'walk_in'] as const;
export type BookingInterfaceType = typeof BOOKING_INTERFACE_TYPES[number];

export const customerNameSchema = z.string().trim().min(2).max(100);
export const customerEmailSchema = z.string().trim().email().max(254);
export const customerPhoneSchema = z.string().trim().min(7).max(30).refine(
    value => {
        const digitCount = value.replace(/\D/g, '').length;
        return digitCount >= 7 && digitCount <= 15;
    },
    'Phone number must contain 7 to 15 digits',
);

const seatLabelsSchema = z.array(z.string().regex(/^RS(?:[1-9]|1[0-6])$/)).max(16)
    .refine(labels => new Set(labels).size === labels.length, 'Seat labels must be unique')
    .optional();

const bookingScheduleFieldsSchema = z.object({
    booking_date: z.string().trim(),
    start_time: z.string().trim(),
    end_time: z.string().trim(),
    seats_booked: z.number().int().positive(),
    seat_labels: seatLabelsSchema,
});

export const createBookingInputSchema = bookingScheduleFieldsSchema.extend({
    user_name: customerNameSchema,
    user_email: customerEmailSchema,
    user_phone: customerPhoneSchema,
    interface_type: z.enum(BOOKING_INTERFACE_TYPES),
});

/**
 * Shape accepted by booking creation. Customer bookings always carry an email
 * and phone; walk-ins may omit both, so they are optional at the type level.
 */
export type CreateBookingInput = Omit<z.infer<typeof createBookingInputSchema>, 'user_email' | 'user_phone'> & {
    user_email: string;
    user_phone?: string;
};

export const formBookingRequestSchema = createBookingInputSchema.extend({
    service_id: z.string().uuid(),
    interface_type: z.literal('form'),
});

const optionalEmailSchema = z.union([customerEmailSchema, z.literal('')])
    .optional()
    .transform(value => value ?? '');

const optionalPhoneSchema = z.union([customerPhoneSchema, z.literal('')])
    .optional()
    .transform(value => value || undefined);

/**
 * Walk-in bookings recorded by staff. Only the customer's name is required;
 * the email, when given, receives the usual confirmation.
 */
export const walkInBookingRequestSchema = bookingScheduleFieldsSchema.extend({
    service_id: z.string().uuid(),
    user_name: customerNameSchema,
    user_email: optionalEmailSchema,
    user_phone: optionalPhoneSchema,
    interface_type: z.literal('walk_in').default('walk_in'),
});

export type WalkInBookingRequest = z.infer<typeof walkInBookingRequestSchema>;
