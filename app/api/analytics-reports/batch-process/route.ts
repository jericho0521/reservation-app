import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminSupabase } from '../report-utils';
import { runSalesReportPipeline } from '@/lib/langchain/sales-report-pipeline';
import { readLimitedJson } from '@/lib/request-body';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const batchProcessSchema = z.object({ documentIds: z.array(z.string().uuid()).min(1).max(10).refine(ids => new Set(ids).size === ids.length) });

export async function POST(request: Request) {
  const { response, supabase } = await requireAdminSupabase();
  if (response) return response;
  const parsed = batchProcessSchema.safeParse(await readLimitedJson(request).catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Supply 1–10 unique document UUIDs' }, { status: 400 });
  const results = [];
  for (const id of parsed.data.documentIds) {
    try {
      const result = await runSalesReportPipeline(id, supabase);
      results.push({ id, status: result.error ? 'failed' : 'needs_review', error: result.error });
    } catch {
      results.push({ id, status: 'failed', error: 'Processing failed' });
    }
  }
  return NextResponse.json({ results, summary: {
    total: results.length, succeeded: 0, needsReview: results.filter(result => !result.error).length,
    failed: results.filter(result => result.error).length,
  } });
}
