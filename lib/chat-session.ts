import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { hashRequestValue } from './request-controls';

const COOKIE = 'booking-chat-session';
function signingKey() {
  const secret = process.env.BOOKING_SIGNING_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error('Booking signing key is unavailable');
  return secret;
}
function sign(value: unknown): string {
  const payload = Buffer.from(JSON.stringify(value)).toString('base64url');
  const mac = createHmac('sha256', signingKey()).update(payload).digest('base64url');
  return `${payload}.${mac}`;
}
function verify(token: unknown): Record<string, unknown> | null {
  if (typeof token !== 'string' || token.length > 8192) return null;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) return null;
  const expected = createHmac('sha256', signingKey()).update(payload).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return typeof data.exp === 'number' && data.exp > Date.now() ? data : null;
  } catch { return null; }
}
export function getChatSession(request: Request) {
  const value = request.headers.get('cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  const existing = verify(value);
  const id = existing?.kind === 'session' && typeof existing.id === 'string' ? existing.id : randomUUID();
  return { id, token: sign({ kind: 'session', id, exp: Date.now() + 86400_000 }) };
}
export function chatResponse(session: ReturnType<typeof getChatSession>, value: unknown, status = 200) {
  const response = NextResponse.json(value, { status });
  response.cookies.set(COOKIE, session.token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: 86400 });
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
export function issueBookingProof(sessionId: string, booking: unknown) {
  return sign({ kind: 'confirmation', sessionId, hash: hashRequestValue(booking), nonce: randomUUID(), exp: Date.now() + 15 * 60_000 });
}
export function verifyBookingProof(token: unknown, sessionId: string, booking: unknown): string | null {
  const proof = verify(token);
  return proof?.kind === 'confirmation' && proof.sessionId === sessionId && proof.hash === hashRequestValue(booking) && typeof proof.nonce === 'string' ? proof.nonce : null;
}
