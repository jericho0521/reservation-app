import { NextResponse } from "next/server";
import { z } from "zod";
import { extractSalesReportFromFile } from "@/lib/sales-report-extraction";
import {
  isSalesReportSetupError,
  loadSalesReport,
  requireAuthenticatedSupabase,
  salesReportSetupResponse,
  saveNormalizedSalesReport,
} from "../report-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const batchProcessSchema = z.object({
  documentIds: z.array(z.string()).min(1),
});

interface BatchProcessResult {
  id: string;
  status: "processed" | "needs_review" | "failed";
  error?: string;
}

export async function POST(request: Request) {
  const { response, supabase } = await requireAuthenticatedSupabase();

  if (response) {
    return response;
  }

  let parsed: z.infer<typeof batchProcessSchema>;

  try {
    parsed = batchProcessSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "A non-empty documentIds array is required" }, { status: 400 });
  }

  const results: BatchProcessResult[] = [];

  for (const id of parsed.documentIds) {
    try {
      const existing = await loadSalesReport(supabase, id);

      if (!existing) {
        results.push({ id, status: "failed", error: "Not found" });
        continue;
      }

      if (existing.status === "processing") {
        results.push({ id, status: "failed", error: "Already processing" });
        continue;
      }

      await supabase
        .from("sales_report_documents")
        .update({
          status: "processing",
          extraction_errors: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      const { data: fileData, error: downloadError } = await supabase.storage
        .from(existing.storage_bucket)
        .download(existing.storage_path);

      if (downloadError || !fileData) {
        const msg = downloadError?.message ?? "Failed to download file";

        await supabase
          .from("sales_report_documents")
          .update({
            status: "failed",
            extraction_errors: [msg],
            processed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", id);

        results.push({ id, status: "failed", error: msg });
        continue;
      }

      const extraction = await extractSalesReportFromFile({
        bytes: await fileData.arrayBuffer(),
        mimeType: existing.file_type,
      });

      if (!extraction.normalized.reportDate) {
        const { data: document, error: reviewUpdateError } = await supabase
          .from("sales_report_documents")
          .update({
            status: "needs_review",
            confidence_score: extraction.normalized.confidenceScore,
            raw_extraction: extraction.raw,
            extraction_errors: extraction.normalized.validationWarnings,
            processed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", id)
          .select()
          .single();

        if (reviewUpdateError) {
          throw reviewUpdateError;
        }

        results.push({ id, status: "needs_review" });
        continue;
      }

      const saved = await saveNormalizedSalesReport({
        supabase,
        sourceDocumentId: id,
        input: extraction.raw,
      });

      if ("error" in saved) {
        results.push({ id, status: "failed", error: "Save error" });
        continue;
      }

      await supabase
        .from("sales_report_documents")
        .update({
          raw_extraction: extraction.raw,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      results.push({ id, status: "processed" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error(`Failed to process sales report ${id}:`, err);

      await supabase
        .from("sales_report_documents")
        .update({
          status: "failed",
          extraction_errors: [message],
          processed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      results.push({ id, status: "failed", error: message });
    }
  }

  const succeeded = results.filter((r) => r.status === "processed").length;
  const needsReview = results.filter((r) => r.status === "needs_review").length;
  const failed = results.filter((r) => r.status === "failed").length;

  return NextResponse.json({
    results,
    summary: { total: results.length, succeeded, needsReview, failed },
  });
}
