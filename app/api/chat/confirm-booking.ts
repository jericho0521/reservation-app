import { z } from "zod";

const confirmBookingSchema = z.object({
  service: z.string().trim().min(1),
  date: z.string().trim().min(1),
  time: z.string().trim().min(1),
  seats: z.number().int().positive(),
  name: z.string().trim().min(1),
  email: z.string().trim().email(),
  phone: z.string().trim().min(1),
});

export type ConfirmBookingPayload = z.infer<typeof confirmBookingSchema>;

export function parseConfirmBookingPayload(value: unknown): ConfirmBookingPayload | null {
  const result = confirmBookingSchema.safeParse(value);
  return result.success ? result.data : null;
}
