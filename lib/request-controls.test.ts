import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';

function setEnv(t: TestContext, name: string, value: string) {
  const previous = process.env[name];
  process.env[name] = value;
  t.after(() => { if (previous === undefined) delete process.env[name]; else process.env[name] = previous; });
}
import { bookingRequestContext, consumeBudget, requestSource, RequestControlError } from './request-controls';

test('only the deployment proxy supplies trusted request addresses', t => {
  setEnv(t, 'VERCEL', '0');
  const request = new Request('https://example.test', { headers: { 'x-forwarded-for': '192.0.2.1', 'Idempotency-Key': 'retry-key-123456789' } });
  assert.equal(requestSource(request), 'shared-origin');
  setEnv(t, 'VERCEL', '1');
  assert.notEqual(requestSource(request), 'shared-origin');
  assert.equal(requestSource(new Request('https://example.test', { headers: { 'x-forwarded-for': 'forged' } })), 'shared-origin');
  const context = bookingRequestContext(request, 'staff-user');
  assert.equal(context.key, 'retry-key-123456789');
  assert.notEqual(context.actor, 'staff-user');
  assert.throws(() => bookingRequestContext(new Request('https://example.test')), (error: unknown) => error instanceof RequestControlError && error.status === 400);
});

test('shared quota exhaustion returns 429 and database errors fail closed', async t => {
  setEnv(t, 'NEXT_PUBLIC_SUPABASE_URL', 'https://example.test');
  setEnv(t, 'SUPABASE_SERVICE_ROLE_KEY', 'local-test-only');
  t.mock.method(globalThis, 'fetch', async () => new Response('false', { headers: { 'Content-Type': 'application/json' } }));
  await assert.rejects(consumeBudget(['test'], [1], 60), (error: unknown) => error instanceof RequestControlError && error.status === 429);
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ message: 'unavailable' }), { status: 400 }));
  await assert.rejects(consumeBudget(['test'], [1], 60), (error: unknown) => error instanceof RequestControlError && error.status === 503);
});
