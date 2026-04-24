import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase-server";
import {
  evaluateSalesReportForPublishing,
  normalizeExtractedSalesReport,
  SALES_REPORT_BUCKET,
  toDailySalesReportInsert,
  validateSalesReportFile,
  type DailySalesReport,
  type SalesReportDocument,
} from "@/lib/sales-reports";

export interface SalesReportListItem extends SalesReportDocument {
  report: DailySalesReport | null;
}

export const manualSalesReportSchema = z.object({
  reportDate: z.string().min(1),
  cashierName: z.string().optional().nullable(),
  shiftStartAt: z.string().optional().nullable(),
  shiftEndAt: z.string().optional().nullable(),
  topupRegisterAmount: z.union([z.number(), z.string(), z.null()]).optional(),
  freebies: z.union([z.number(), z.string(), z.null()]).optional(),
  deductedAmount: z.union([z.number(), z.string(), z.null()]).optional(),
  refundBalance: z.union([z.number(), z.string(), z.null()]).optional(),
  cashierMPlus: z.union([z.number(), z.string(), z.null()]).optional(),
  cashierUserMPlus: z.union([z.number(), z.string(), z.null()]).optional(),
  itemsSales: z.union([z.number(), z.string(), z.null()]).optional(),
  userPurchase: z.union([z.number(), z.string(), z.null()]).optional(),
  freeItems: z.union([z.number(), z.string(), z.null()]).optional(),
  pointRedemption: z.union([z.number(), z.string(), z.null()]).optional(),
  cashStockIn: z.union([z.number(), z.string(), z.null()]).optional(),
  receivedFromLastShift: z.union([z.number(), z.string(), z.null()]).optional(),
  reserveToNextDuty: z.union([z.number(), z.string(), z.null()]).optional(),
  reloadCoupon: z.union([z.number(), z.string(), z.null()]).optional(),
  cardFeeRegistered: z.union([z.number(), z.string(), z.null()]).optional(),
  otherExpenses: z.union([z.number(), z.string(), z.null()]).optional(),
  shiftIncome: z.union([z.number(), z.string(), z.null()]).optional(),
  totalCash: z.union([z.number(), z.string(), z.null()]).optional(),
  offDutyAmount: z.union([z.number(), z.string(), z.null()]).optional(),
  grossSales: z.union([z.number(), z.string(), z.null()]).optional(),
  netSales: z.union([z.number(), z.string(), z.null()]).optional(),
  discounts: z.union([z.number(), z.string(), z.null()]).optional(),
  tax: z.union([z.number(), z.string(), z.null()]).optional(),
  refunds: z.union([z.number(), z.string(), z.null()]).optional(),
  transactionCount: z.union([z.number(), z.string(), z.null()]).optional(),
  paymentBreakdown: z.record(z.union([z.number(), z.string(), z.null()])).optional().default({}),
  notes: z.string().optional().nullable(),
  confidence: z.number().min(0).max(1).optional(),
});

export const patchSalesReportSchema = z.object({
  report: manualSalesReportSchema,
  publish: z.boolean().optional().default(false),
});

export function isSalesReportSetupError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as { code?: string; message?: string; statusCode?: string };

  return (
    maybeError.code === "PGRST205" ||
    maybeError.message?.includes("sales_report_documents") ||
    maybeError.message?.includes("daily_sales_reports") ||
    maybeError.message?.includes("Bucket not found") ||
    maybeError.statusCode === "404"
  );
}

export function salesReportSetupResponse() {
  return NextResponse.json(
    {
      error: "Sales report storage is not set up yet. Run supabase/sales-reports.sql in Supabase, then refresh this page.",
      setupRequired: true,
    },
    { status: 503 },
  );
}

export async function requireAuthenticatedSupabase() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      response: NextResponse.json({ error: "Admin authentication required" }, { status: 401 }),
      supabase,
      user: null,
    };
  }

  return {
    response: null,
    supabase,
    user,
  };
}

export async function loadSalesReports(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: documents, error } = await supabase
    .from("sales_report_documents")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(25);

  if (error) {
    throw error;
  }

  const typedDocuments = (documents ?? []) as SalesReportDocument[];
  const documentIds = typedDocuments.map(document => document.id);

  if (documentIds.length === 0) {
    return [];
  }

  const { data: reports, error: reportsError } = await supabase
    .from("daily_sales_reports")
    .select("*")
    .in("source_document_id", documentIds);

  if (reportsError) {
    throw reportsError;
  }

  const reportsByDocumentId = new Map(
    ((reports ?? []) as DailySalesReport[]).map(report => [report.source_document_id, report]),
  );

  return typedDocuments.map<SalesReportListItem>(document => ({
    ...document,
    report: reportsByDocumentId.get(document.id) ?? null,
  }));
}

export async function loadSalesReport(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
): Promise<SalesReportListItem | null> {
  const { data: document, error } = await supabase
    .from("sales_report_documents")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!document) {
    return null;
  }

  const { data: report, error: reportError } = await supabase
    .from("daily_sales_reports")
    .select("*")
    .eq("source_document_id", id)
    .maybeSingle();

  if (reportError) {
    throw reportError;
  }

  return {
    ...(document as SalesReportDocument),
    report: (report as DailySalesReport | null) ?? null,
  };
}

export async function hasPublishedReportForDate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  reportDate: string | null,
  sourceDocumentId: string,
) {
  if (!reportDate) {
    return false;
  }

  const { data, error } = await supabase
    .from("daily_sales_reports")
    .select("id")
    .eq("report_date", reportDate)
    .eq("is_published", true)
    .neq("source_document_id", sourceDocumentId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(data);
}

export async function saveNormalizedSalesReport({
  supabase,
  sourceDocumentId,
  input,
  forcePublish = false,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  sourceDocumentId: string;
  input: unknown;
  forcePublish?: boolean;
}) {
  const normalized = normalizeExtractedSalesReport(input);
  const hasDuplicatePublishedDate = await hasPublishedReportForDate(
    supabase,
    normalized.reportDate,
    sourceDocumentId,
  );
  const evaluation = evaluateSalesReportForPublishing(normalized, {
    hasPublishedReportForDate: hasDuplicatePublishedDate,
  });
  const finalEvaluation = forcePublish
    ? {
      ...evaluation,
      status: "published" as const,
      isPublished: true,
      warnings: evaluation.warnings.filter(warning => !warning.includes("already exists")),
    }
    : evaluation;

  if (forcePublish && hasDuplicatePublishedDate) {
    return {
      error: NextResponse.json(
        { error: "A published sales report already exists for this date." },
        { status: 409 },
      ),
    };
  }

  if (!normalized.reportDate) {
    return {
      error: NextResponse.json(
        { error: "Report date is required before saving the daily sales report." },
        { status: 400 },
      ),
    };
  }

  const payload = toDailySalesReportInsert(sourceDocumentId, normalized, finalEvaluation);
  const { data: report, error } = await supabase
    .from("daily_sales_reports")
    .upsert(payload, { onConflict: "source_document_id" })
    .select()
    .single();

  if (error) {
    throw error;
  }

  const { data: document, error: updateError } = await supabase
    .from("sales_report_documents")
    .update({
      status: finalEvaluation.status,
      confidence_score: normalized.confidenceScore,
      extraction_errors: finalEvaluation.warnings,
      processed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", sourceDocumentId)
    .select()
    .single();

  if (updateError) {
    throw updateError;
  }

  return {
    document: document as SalesReportDocument,
    report: report as DailySalesReport,
    evaluation: finalEvaluation,
  };
}

export function buildStoragePath(userId: string, fileName: string) {
  const safeName = fileName.replace(/[^\w.\- ]/g, "_").replace(/\s+/g, "-");
  return `${userId}/${Date.now()}-${safeName}`;
}

export function validateUploadFile(file: File) {
  return validateSalesReportFile({
    name: file.name,
    size: file.size,
    type: file.type,
  });
}

export { SALES_REPORT_BUCKET };
