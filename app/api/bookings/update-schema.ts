import { z } from 'zod';
import { ADMIN_BOOKING_STATUSES } from '@/app/admin/dashboard-data';

export const bookingUpdateSchema = z.object({
    service_id: z.string().uuid().optional(),
    user_name: z.string().min(1).optional(),
    user_email: z.string().email().optional(),
    booking_date: z.string().min(1).optional(),
    start_time: z.string().min(1).optional(),
    end_time: z.string().min(1).optional(),
    seats_booked: z.number().positive().optional(),
    seat_labels: z.array(z.string()).optional(),
    interface_type: z.enum(['form', 'chat']).optional(),
    status: z.enum(ADMIN_BOOKING_STATUSES).optional(),
}).strict().refine(value => Object.keys(value).length > 0, {
    message: 'At least one booking field is required',
});
