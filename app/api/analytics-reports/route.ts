import { readLimitedFormData, RequestBodyError } from "@/lib/request-body";
import { storeReportUpload } from "@/lib/report-upload";
import { NextResponse } from "next/server";
import {
  isSalesReportSetupError,
  loadSalesReports,
  requireAdminSupabase,
  salesReportSetupResponse,
  validateUploadFile,
} from "./report-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { response, supabase } = await requireAdminSupabase();

    if (response) {
      return response;
    }

    const reports = await loadSalesReports(supabase);
    return NextResponse.json({ reports });
  } catch (error) {
    if (error instanceof RequestBodyError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (isSalesReportSetupError(error)) {
      return salesReportSetupResponse();
    }

    console.error("Failed to load sales reports:", error);
    return NextResponse.json({ error: "Failed to load sales reports" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { response, supabase, user } = await requireAdminSupabase();

    if (response || !user) {
      return response ?? NextResponse.json({ error: "Admin authentication required" }, { status: 401 });
    }

    const formData = await readLimitedFormData(request);
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "A sales report file is required" }, { status: 400 });
    }

    const validationError = validateUploadFile(file);

    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const document = await storeReportUpload(supabase, user.id, file);

    return NextResponse.json({ document }, { status: 201 });
  } catch (error) {
    if (error instanceof RequestBodyError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (isSalesReportSetupError(error)) {
      return salesReportSetupResponse();
    }

    console.error("Failed to upload sales report:", error);
    return NextResponse.json({ error: "Failed to upload sales report" }, { status: 500 });
  }
}
