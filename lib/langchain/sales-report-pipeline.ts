import type { SupabaseClient } from '@supabase/supabase-js';
import { extractSalesReportFromFile } from '@/lib/sales-report-extraction';
import { saveNormalizedSalesReport } from '@/app/api/analytics-reports/report-utils';
import type { SalesReportDocument } from '@/lib/sales-reports';

export async function runSalesReportPipeline(documentId: string, client: SupabaseClient) {
  const { data: claimed, error: claimError } = await client.from('sales_report_documents')
    .update({ status: 'processing', extraction_errors: null, updated_at: new Date().toISOString() })
    .eq('id', documentId).in('status', ['pending', 'failed']).select().maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) return { error: 'Document is already processing or has been processed', status: 'conflict', document: null, report: null, rawExtraction: null };
  const document = claimed as SalesReportDocument;
  try {
    const { data: file, error } = await client.storage.from(document.storage_bucket).download(document.storage_path);
    if (error || !file) throw error ?? new Error('Report file is missing');
    const extraction = await extractSalesReportFromFile({ bytes: await file.arrayBuffer(), mimeType: document.file_type });
    if (!extraction.normalized.reportDate) {
      const { data, error } = await client.from('sales_report_documents').update({
        status: 'needs_review', raw_extraction: extraction.raw,
        extraction_errors: extraction.normalized.validationWarnings,
        processed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq('id', documentId).eq('updated_at', document.updated_at).select().single();
      if (error) throw error;
      return { document: data, report: null, rawExtraction: extraction.raw, status: 'needs_review', error: null };
    }
    const saved = await saveNormalizedSalesReport({
      supabase: client, sourceDocumentId: documentId, input: extraction.raw,
      expectedUpdatedAt: document.updated_at, rawExtraction: extraction.raw,
    });
    if ('error' in saved) throw new Error('Report changed or could not be saved');
    return { document: saved.document, report: saved.report, rawExtraction: extraction.raw, status: 'needs_review', error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Report processing failed';
    const { error: updateError } = await client.from('sales_report_documents')
      .update({ status: 'failed', extraction_errors: [message], updated_at: new Date().toISOString() })
      .eq('id', documentId).eq('updated_at', document.updated_at);
    if (updateError) throw updateError;
    return { document, report: null, rawExtraction: null, status: 'failed', error: message };
  }
}
