import assert from 'node:assert/strict';
import test from 'node:test';
import { readLimitedBody } from './request-body';

test('rejects oversized declared and streamed bodies before retaining excess bytes', async () => {
  await assert.rejects(readLimitedBody(new Request('https://example.test', { method: 'POST', body: 'abc', headers: { 'content-length': '100' } }), 5), /too large/);
  await assert.rejects(readLimitedBody(new Request('https://example.test', { method: 'POST', body: '123456' }), 5), /too large/);
  assert.equal(new TextDecoder().decode(await readLimitedBody(new Request('https://example.test', { method: 'POST', body: '12345' }), 5)), '12345');
});
