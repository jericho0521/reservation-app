import { NextResponse } from "next/server";
import {
  buildStoragePath,
  isSalesReportSetupError,
  requireAuthenticatedSupabase,
  SALES_REPORT_BUCKET,
  salesReportSetupResponse,
  validateUploadFile,
} from "../report-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface BatchUploadResult {
  id: string;
  fileName: string;
  status: "created" | "error";
  error?: string;
}

export async function POST(request: Request) {
  try {
    const { response, supabase, user } = await requireAuthenticatedSupabase();

    if (response || !user) {
      return response ?? NextResponse.json({ error: "Admin authentication required" }, { status: 401 });
    }

    const formData = await request.formData();
    const files = formData.getAll("files");

    if (files.length === 0) {
      return NextResponse.json({ error: "At least one sales report file is required" }, { status: 400 });
    }

    const results: BatchUploadResult[] = [];

    for (const entry of files) {
      if (!(entry instanceof File)) {
        results.push({ id: "", fileName: "unknown", status: "error", error: "Invalid file entry" });
        continue;
      }

      const validationError = validateUploadFile(entry);

      if (validationError) {
        results.push({ id: "", fileName: entry.name, status: "error", error: validationError });
        continue;
      }

      try {
        const storagePath = buildStoragePath(user.id, entry.name);
        const { error: uploadError } = await supabase.storage
          .from(SALES_REPORT_BUCKET)
          .upload(storagePath, entry, {
            contentType: entry.type,
            upsert: false,
          });

        if (uploadError) {
          if (isSalesReportSetupError(uploadError)) {
            return salesReportSetupResponse();
          }

          results.push({ id: "", fileName: entry.name, status: "error", error: uploadError.message });
          continue;
        }

        const { data: document, error: insertError } = await supabase
          .from("sales_report_documents")
          .insert({
            uploaded_by: user.id,
            file_name: entry.name,
            file_type: entry.type,
            file_size: entry.size,
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

          results.push({ id: "", fileName: entry.name, status: "error", error: insertError.message });
          continue;
        }

        results.push({ id: document.id, fileName: entry.name, status: "created" });
      } catch (err) {
        results.push({
          id: "",
          fileName: entry.name,
          status: "error",
          error: err instanceof Error ? err.message : "Upload failed",
        });
      }
    }

    const succeeded = results.filter((r) => r.status === "created").length;
    const failed = results.filter((r) => r.status === "error").length;

    return NextResponse.json({ results, summary: { total: results.length, succeeded, failed } }, { status: 201 });
  } catch (error) {
    if (isSalesReportSetupError(error)) {
      return salesReportSetupResponse();
    }

    console.error("Failed to batch upload sales reports:", error);
    return NextResponse.json({ error: "Failed to batch upload sales reports" }, { status: 500 });
  }
}
