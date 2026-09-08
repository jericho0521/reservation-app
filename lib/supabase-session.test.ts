import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { updateSession } from './supabase-session';

test('refreshed tokens reach both the Server Component request and browser response', async () => {
  const request = new NextRequest('https://example.test/admin');
  const response = await updateSession(request, ((_url, _key, options) => ({
    auth: { getUser: async () => {
      options.cookies.setAll!([{ name: 'sb-token', value: 'rotated', options: { httpOnly: true, path: '/' } }]);
      return { data: { user: null }, error: null };
    } },
  })));
  assert.equal(request.cookies.get('sb-token')?.value, 'rotated');
  assert.equal(response.cookies.get('sb-token')?.value, 'rotated');
  assert.equal(response.cookies.get('sb-token')?.httpOnly, true);
  assert.match(response.headers.get('Cache-Control')!, /no-store/);
});
