import { NextResponse } from "next/server";
import {
  isSalesReportSetupError,
  loadSalesReport,
  patchSalesReportSchema,
  requireAdminSupabase,
  salesReportSetupResponse,
  saveNormalizedSalesReport,
} from "../report-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { response, supabase } = await requireAdminSupabase();

    if (response) {
      return response;
    }

    const report = await loadSalesReport(supabase, id);

    if (!report) {
      return NextResponse.json({ error: "Sales report not found" }, { status: 404 });
    }

    return NextResponse.json({ report });
  } catch (error) {
    if (isSalesReportSetupError(error)) {
      return salesReportSetupResponse();
    }

    console.error("Failed to load sales report:", error);
    return NextResponse.json({ error: "Failed to load sales report" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { response, supabase } = await requireAdminSupabase();

    if (response) {
      return response;
    }

    const body = patchSalesReportSchema.parse(await request.json());
    const existing = await loadSalesReport(supabase, id);

    if (!existing) {
      return NextResponse.json({ error: "Sales report not found" }, { status: 404 });
    }

    if (existing.status === "processing") return NextResponse.json({ error: "Report is processing" }, { status: 409 });

    const saved = await saveNormalizedSalesReport({
      supabase,
      sourceDocumentId: id,
      input: {
        ...body.report,
        confidence: body.publish ? 1 : body.report.confidence,
      },
      forcePublish: body.publish,
      expectedUpdatedAt: body.expectedUpdatedAt,
    });

    if ("error" in saved) {
      return saved.error;
    }

    return NextResponse.json({
      document: saved.document,
      report: saved.report,
    });
  } catch (error) {
    if (isSalesReportSetupError(error)) {
      return salesReportSetupResponse();
    }

    if (error instanceof Error && error.name === "ZodError") return NextResponse.json({ error: "Invalid report update; reload before saving" }, { status: 400 });
    console.error("Failed to update sales report:", error);
    return NextResponse.json({ error: "Failed to update sales report" }, { status: 500 });
  }
}
