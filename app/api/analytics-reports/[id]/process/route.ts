import { NextResponse } from "next/server";
import { extractSalesReportFromFile } from "@/lib/sales-report-extraction";
import {
  isSalesReportSetupError,
  loadSalesReport,
  requireAuthenticatedSupabase,
  salesReportSetupResponse,
  saveNormalizedSalesReport,
} from "../../report-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { response, supabase } = await requireAuthenticatedSupabase();

  if (response) {
    return response;
  }

  try {
    const existing = await loadSalesReport(supabase, id);

    if (!existing) {
      return NextResponse.json({ error: "Sales report not found" }, { status: 404 });
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
      throw downloadError ?? new Error("Failed to download sales report file");
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

      return NextResponse.json({
        document,
        report: null,
      });
    }

    const saved = await saveNormalizedSalesReport({
      supabase,
      sourceDocumentId: id,
      input: extraction.raw,
    });

    if ("error" in saved) {
      return saved.error;
    }

    const { data: document, error: rawUpdateError } = await supabase
      .from("sales_report_documents")
      .update({
        raw_extraction: extraction.raw,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (rawUpdateError) {
      throw rawUpdateError;
    }

    return NextResponse.json({
      document,
      report: saved.report,
    });
  } catch (error) {
    if (isSalesReportSetupError(error)) {
      return salesReportSetupResponse();
    }

    const message = error instanceof Error ? error.message : "Unknown extraction error";
    console.error("Failed to process sales report:", error);

    await supabase
      .from("sales_report_documents")
      .update({
        status: "failed",
        extraction_errors: [message],
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    return NextResponse.json({ error: "Failed to process sales report" }, { status: 500 });
  }
}
