import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { supabaseAdmin } from './supabase-admin';

export class RequestControlError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export function hashRequestValue(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
export function requestSource(request: Request): string {
  // Vercel overwrites this header. Other deployments share a conservative bucket.
  const candidate = process.env.VERCEL === '1' ? request.headers.get('x-forwarded-for')?.split(',')[0].trim() : undefined;
  return candidate && isIP(candidate) ? hashRequestValue(candidate) : 'shared-origin';
}
export interface BookingRequestContext { actor: string; source: string; key: string }
export function bookingRequestContext(request: Request, actor?: string): BookingRequestContext {
  const key = request.headers.get('idempotency-key');
  if (!key || !/^[a-zA-Z0-9_-]{16,128}$/.test(key)) throw new RequestControlError('A valid Idempotency-Key header is required', 400);
  const source = requestSource(request);
  return { key, source, actor: actor ? hashRequestValue(actor) : source };
}
export async function consumeBudget(keys: string[], limits: number[], windowSeconds: number) {
  const { data, error } = await supabaseAdmin().rpc('consume_request_budget', { p_keys: keys, p_limits: limits, p_window_seconds: windowSeconds });
  if (error) throw new RequestControlError('Request controls are temporarily unavailable', 503);
  if (data !== true) throw new RequestControlError('Too many requests. Please try again later.', 429);
}
export async function consumeBookingBudget(context: BookingRequestContext, serviceId: string, date: string, email: string) {
  await consumeBudget(['0-global:bookings', `booking-ip:${context.source}`, `booking-actor:${context.actor}`, `booking-service:${serviceId}:${date}`], [200, 10, 20, 100], 3600);
  if (email) await consumeBudget(['0-global:email', `email-recipient:${hashRequestValue(email.trim().toLowerCase())}`], [300, 3], 86400);
}
