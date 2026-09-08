import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { storeReportUpload } from './report-upload';

test('failed metadata insertion removes the uploaded object, including thrown failures', async () => {
  for (const throws of [false, true]) {
    const uploaded: string[] = [];
    const removed: string[] = [];
    const client = {
      storage: { from: () => ({ upload: async (path: string) => { uploaded.push(path); return { error: null }; }, remove: async (paths: string[]) => { removed.push(...paths); return { error: null }; } }) },
      from: () => ({ insert: () => ({ select: () => ({ single: async () => { if (throws) throw new Error('insert failed'); return { data: null, error: new Error('insert failed') }; } }) }) }),
    } as unknown as SupabaseClient;
    await assert.rejects(storeReportUpload(client, 'staff', new File(['x'], 'report.pdf', { type: 'application/pdf' })), /insert failed/);
    assert.deepEqual(removed, uploaded);
  }
});
