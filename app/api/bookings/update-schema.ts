import { z } from 'zod';
import { ADMIN_BOOKING_STATUSES } from '@/app/admin/dashboard-data';
import { BOOKING_INTERFACE_TYPES } from '@/lib/booking-schema';

export const bookingUpdateSchema = z.object({
    service_id: z.string().uuid().optional(),
    user_name: z.string().min(1).optional(),
    user_email: z.string().email().optional(),
    booking_date: z.string().min(1).optional(),
    start_time: z.string().min(1).optional(),
    end_time: z.string().min(1).optional(),
    seats_booked: z.number().int().positive().optional(),
    seat_labels: z.array(z.string().regex(/^RS(?:[1-9]|1[0-6])$/)).max(16).refine(labels => new Set(labels).size === labels.length, 'Seat labels must be unique').optional(),
    interface_type: z.enum(BOOKING_INTERFACE_TYPES).optional(),
    status: z.enum(ADMIN_BOOKING_STATUSES).optional(),
}).strict().refine(value => Object.keys(value).length > 0, {
    message: 'At least one booking field is required',
});
