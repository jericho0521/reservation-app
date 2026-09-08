import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';

function setEnv(t: TestContext, name: string, value: string) {
  const previous = process.env[name];
  process.env[name] = value;
  t.after(() => { if (previous === undefined) delete process.env[name]; else process.env[name] = previous; });
}
import { getChatSession, chatResponse, issueBookingProof, verifyBookingProof } from './chat-session';

test('signed sessions ignore client thread IDs and reject forged cookies', t => {
  setEnv(t, 'BOOKING_SIGNING_SECRET', 'local-test-signing-key');
  const first = getChatSession(new Request('https://example.test/chat'));
  const existing = getChatSession(new Request('https://example.test/chat?threadId=attacker', { headers: { cookie: `booking-chat-session=${first.token}` } }));
  assert.equal(existing.id, first.id);
  const forged = getChatSession(new Request('https://example.test/chat', { headers: { cookie: `booking-chat-session=${first.token}tampered` } }));
  assert.notEqual(forged.id, first.id);
  assert.notEqual(getChatSession(new Request('https://example.test/chat')).id, first.id);
  const response = chatResponse(first, {});
  assert.match(response.headers.get('set-cookie')!, /HttpOnly/);
  assert.match(response.headers.get('set-cookie')!, /SameSite=strict/i);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
});

test('confirmation proof binds every booking field to one session and expires', t => {
  setEnv(t, 'BOOKING_SIGNING_SECRET', 'local-test-signing-key');
  const booking = { service: 'VR', seats: 2, email: 'guest@example.test' };
  const proof = issueBookingProof('session-a', booking);
  const nonce = verifyBookingProof(proof, 'session-a', booking);
  assert.ok(nonce);
  assert.equal(verifyBookingProof(proof, 'session-a', booking), nonce);
  assert.equal(verifyBookingProof(proof, 'session-b', booking), null);
  assert.equal(verifyBookingProof(proof, 'session-a', { ...booking, seats: 3 }), null);
  assert.equal(verifyBookingProof(proof + 'x', 'session-a', booking), null);
  assert.equal(verifyBookingProof(undefined, 'session-a', booking), null);
  const later = Date.now() + 16 * 60_000;
  t.mock.method(Date, 'now', () => later);
  assert.equal(verifyBookingProof(proof, 'session-a', booking), null);
});
