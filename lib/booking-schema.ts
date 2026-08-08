import { z } from 'zod';

export const customerNameSchema = z.string().trim().min(2).max(100);
export const customerEmailSchema = z.string().trim().email().max(254);
export const customerPhoneSchema = z.string().trim().min(7).max(30).refine(
    value => {
        const digitCount = value.replace(/\D/g, '').length;
        return digitCount >= 7 && digitCount <= 15;
    },
    'Phone number must contain 7 to 15 digits',
);

export const createBookingInputSchema = z.object({
    user_name: customerNameSchema,
    user_email: customerEmailSchema,
    user_phone: customerPhoneSchema,
    booking_date: z.string().trim(),
    start_time: z.string().trim(),
    end_time: z.string().trim(),
    seats_booked: z.number().int().positive(),
    seat_labels: z.array(z.string().regex(/^RS(?:[1-9]|1[0-6])$/)).max(16)
        .refine(labels => new Set(labels).size === labels.length, 'Seat labels must be unique')
        .optional(),
    interface_type: z.enum(['form', 'chat']),
});

export type CreateBookingInput = z.infer<typeof createBookingInputSchema>;

export const formBookingRequestSchema = createBookingInputSchema.extend({
    service_id: z.string().uuid(),
    interface_type: z.literal('form'),
});
