import type { SupabaseClient } from '@supabase/supabase-js';
import { SALES_REPORT_BUCKET } from './sales-reports';

export async function storeReportUpload(client: SupabaseClient, userId: string, file: File) {
  const safeName = file.name.replace(/[^\w.-]/g, '_');
  const storagePath = `${userId}/${crypto.randomUUID()}-${safeName}`;
  const storage = client.storage.from(SALES_REPORT_BUCKET);
  const { error: uploadError } = await storage.upload(storagePath, file, { contentType: file.type, upsert: false });
  if (uploadError) throw uploadError;
  try {
    const { data, error } = await client.from('sales_report_documents').insert({
      uploaded_by: userId, file_name: file.name, file_type: file.type, file_size: file.size,
      storage_bucket: SALES_REPORT_BUCKET, storage_path: storagePath, status: 'pending',
    }).select().single();
    if (error) throw error;
    return data;
  } catch (error) {
    const { error: cleanupError } = await storage.remove([storagePath]);
    if (cleanupError) console.error('Report upload cleanup failed', { storagePath, error: cleanupError.message });
    throw error;
  }
}
