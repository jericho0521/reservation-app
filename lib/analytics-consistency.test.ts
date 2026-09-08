import assert from 'node:assert/strict';
import test from 'node:test';
import { parseDateRange } from './analytics-date-range';
import { readAllRows } from './read-all-rows';

test('relative periods use Malaysia calendar at UTC day and month boundaries', () => {
  const now = new Date('2026-08-31T17:00:00Z');
  assert.deepEqual(parseDateRange('today', now), { startDate: '2026-09-01', endDate: '2026-09-01' });
  assert.deepEqual(parseDateRange('this month', now), { startDate: '2026-09-01', endDate: '2026-09-30' });
  assert.deepEqual(parseDateRange('this week', now), { startDate: '2026-08-30', endDate: '2026-09-05' });
});
test('analytics pagination includes records beyond the API row limit', async () => {
  const data = Array.from({ length: 1201 }, (_, id) => ({ id }));
  assert.deepEqual(await readAllRows(async (from, to) => ({ data: data.slice(from, to + 1), error: null })), data);
  await assert.rejects(readAllRows(async () => ({ data: null, error: new Error('denied') })), /denied/);
});

test('successive follow-ups preserve date context until an explicit period replaces it', async () => {
  const { resolveAnalyticsDateQuery } = await import('./analytics-date-range');
  const first = resolveAnalyticsDateQuery('break it down by service', 'January');
  const second = resolveAnalyticsDateQuery('show a pie chart', first);
  assert.equal(second, 'January');
  assert.equal(resolveAnalyticsDateQuery('today instead', second), 'today instead');
});
