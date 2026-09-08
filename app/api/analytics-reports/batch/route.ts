import { readLimitedFormData, RequestBodyError } from "@/lib/request-body";
import { storeReportUpload } from "@/lib/report-upload";
import { NextResponse } from "next/server";
import {
  isSalesReportSetupError,
  requireAdminSupabase,
  salesReportSetupResponse,
  validateUploadFile,
} from "../report-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface BatchUploadResult {
  id: string;
  fileName: string;
  index: number;
  status: "created" | "error";
  error?: string;
}

export async function POST(request: Request) {
  try {
    const { response, supabase, user } = await requireAdminSupabase();

    if (response || !user) {
      return response ?? NextResponse.json({ error: "Admin authentication required" }, { status: 401 });
    }

    const formData = await readLimitedFormData(request);
    const files = formData.getAll("files");
    if (files.length > 10) return NextResponse.json({ error: "Upload at most 10 files per batch" }, { status: 400 });

    if (files.length === 0) {
      return NextResponse.json({ error: "At least one sales report file is required" }, { status: 400 });
    }

    const results: BatchUploadResult[] = [];

    for (const [index, entry] of files.entries()) {
      if (!(entry instanceof File)) {
        results.push({ index, id: "", fileName: "unknown", status: "error", error: "Invalid file entry" });
        continue;
      }

      const validationError = validateUploadFile(entry);

      if (validationError) {
        results.push({ index, id: "", fileName: entry.name, status: "error", error: validationError });
        continue;
      }

      try {
        const document = await storeReportUpload(supabase, user.id, entry);
        results.push({ index, id: document.id, fileName: entry.name, status: "created" });
      } catch (err) {
        results.push({ index,
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
    if (error instanceof RequestBodyError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (isSalesReportSetupError(error)) {
      return salesReportSetupResponse();
    }

    console.error("Failed to batch upload sales reports:", error);
    return NextResponse.json({ error: "Failed to batch upload sales reports" }, { status: 500 });
  }
}
