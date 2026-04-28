import { NextResponse } from "next/server";
import { runSalesReportPipeline } from "@/lib/langchain/sales-report-pipeline";
import {
  isSalesReportSetupError,
  loadSalesReport,
  requireAuthenticatedSupabase,
  salesReportSetupResponse,
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

    const result = await runSalesReportPipeline(id);

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      document: result.document,
      report: result.report,
      rawExtraction: result.rawExtraction,
      status: result.status,
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
