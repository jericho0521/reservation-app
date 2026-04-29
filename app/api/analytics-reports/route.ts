import { NextResponse } from "next/server";
import {
  buildStoragePath,
  isSalesReportSetupError,
  loadSalesReports,
  requireAuthenticatedSupabase,
  SALES_REPORT_BUCKET,
  salesReportSetupResponse,
  validateUploadFile,
} from "./report-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { response, supabase } = await requireAuthenticatedSupabase();

    if (response) {
      return response;
    }

    const reports = await loadSalesReports(supabase);
    return NextResponse.json({ reports });
  } catch (error) {
    if (isSalesReportSetupError(error)) {
      return salesReportSetupResponse();
    }

    console.error("Failed to load sales reports:", error);
    return NextResponse.json({ error: "Failed to load sales reports" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { response, supabase, user } = await requireAuthenticatedSupabase();

    if (response || !user) {
      return response ?? NextResponse.json({ error: "Admin authentication required" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "A sales report file is required" }, { status: 400 });
    }

    const validationError = validateUploadFile(file);

    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const storagePath = buildStoragePath(user.id, file.name);
    const { error: uploadError } = await supabase.storage
      .from(SALES_REPORT_BUCKET)
      .upload(storagePath, file, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      if (isSalesReportSetupError(uploadError)) {
        return salesReportSetupResponse();
      }

      throw uploadError;
    }

    const { data: document, error: insertError } = await supabase
      .from("sales_report_documents")
      .insert({
        uploaded_by: user.id,
        file_name: file.name,
        file_type: file.type,
        file_size: file.size,
        storage_bucket: SALES_REPORT_BUCKET,
        storage_path: storagePath,
        status: "pending",
      })
      .select()
      .single();

    if (insertError) {
      if (isSalesReportSetupError(insertError)) {
        return salesReportSetupResponse();
      }

      throw insertError;
    }

    return NextResponse.json({ document }, { status: 201 });
  } catch (error) {
    if (isSalesReportSetupError(error)) {
      return salesReportSetupResponse();
    }

    console.error("Failed to upload sales report:", error);
    return NextResponse.json({ error: "Failed to upload sales report" }, { status: 500 });
  }
}
