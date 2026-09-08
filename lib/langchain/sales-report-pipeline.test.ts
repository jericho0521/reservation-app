import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { runSalesReportPipeline } from './sales-report-pipeline';

test('concurrent processing uses one authenticated claim and one download', async () => {
  let claimed = false;
  let downloads = 0;
  const builder = {
    update: () => builder, eq: () => builder, in: () => builder, select: () => builder,
    maybeSingle: async () => {
      if (claimed) return { data: null, error: null };
      claimed = true;
      return { data: { id: 'doc', storage_bucket: 'private', storage_path: 'file', updated_at: '2026-09-08T00:00:00Z' }, error: null };
    },
    then: (resolve: (value: { error: null }) => void) => resolve({ error: null }),
  };
  const client = {
    from: () => builder,
    storage: { from: () => ({ download: async () => { downloads += 1; return { data: null, error: new Error('download failed') }; } }) },
  } as unknown as SupabaseClient;
  const results = await Promise.all([runSalesReportPipeline('doc', client), runSalesReportPipeline('doc', client)]);
  assert.equal(downloads, 1);
  assert.ok(results.some(result => result.status === 'conflict'));
});
