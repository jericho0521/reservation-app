import assert from 'node:assert/strict';
import test from 'node:test';
import { createConfirmedBooking, BookingCreationError, type ValidatedCreateBookingInput } from './create-booking';
import { hashRequestValue } from './request-controls';

test('retries return the original booking without quota, insert, or email work; changed payloads conflict', async t => {
  const previous = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'local-test-only';
  t.after(() => {
    if (previous.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = previous.url;
    if (previous.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previous.key;
  });
  const service = { id: 'test-service', name: 'VR', total_seats: 4 };
  const input = { user_name: 'Guest', user_email: 'guest@example.test', user_phone: '+60123456789', booking_date: '2026-09-09', start_time: '14:00', end_time: '15:00', seats_booked: 1, interface_type: 'chat' } as ValidatedCreateBookingInput;
  const context = { actor: 'actor', source: 'source', key: 'retry-key' };
  const requestHash = hashRequestValue({ serviceId: service.id, ...input, user_email: input.user_email, seat_labels: [] });
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url: RequestInfo | URL, init?: RequestInit) => {
    calls += 1;
    assert.match(String(url), /bookings\?/);
    assert.equal(init?.method, 'GET');
    return new Response(JSON.stringify({ id: 'original-booking', ...input, request_hash: requestHash, confirmation_email_sent: true }), { headers: { 'Content-Type': 'application/json' } });
  });
  const booking = await createConfirmedBooking(service, input, context);
  assert.equal(booking.id, 'original-booking');
  assert.equal(booking.email_sent, true);
  assert.equal(calls, 1);
  await assert.rejects(createConfirmedBooking(service, { ...input, seats_booked: 2 }, context), (error: unknown) => error instanceof BookingCreationError && error.status === 409);
  assert.equal(calls, 2);
});
