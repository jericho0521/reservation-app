import { Annotation, StateGraph, END } from "@langchain/langgraph";
import { MemorySaver } from "@langchain/langgraph";
import { supabase } from "@/lib/supabase";
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  normalizeExtractedSalesReport,
  evaluateSalesReportForPublishing,
  toDailySalesReportInsert,
  type NormalizedSalesReport,
  type PublishingEvaluation,
  type DailySalesReport,
  type SalesReportDocument,
} from "@/lib/sales-reports";

const EXTRACTION_PROMPT = `Extract the cashier shift sales report from this Project Play By CW document.

Return JSON only with this exact shape:
{
  "reportDate": "YYYY-MM-DD",
  "cashierName": "string",
  "shiftStartAt": "YYYY-MM-DD HH:mm:ss",
  "shiftEndAt": "YYYY-MM-DD HH:mm:ss",
  "topupRegisterAmount": number,
  "freebies": number,
  "deductedAmount": number,
  "refundBalance": number,
  "cashierMPlus": number,
  "cashierUserMPlus": number,
  "itemsSales": number,
  "userPurchase": number,
  "freeItems": number,
  "pointRedemption": number,
  "cashStockIn": number,
  "receivedFromLastShift": number,
  "reserveToNextDuty": number,
  "reloadCoupon": number,
  "cardFeeRegistered": number,
  "otherExpenses": number,
  "shiftIncome": number,
  "totalCash": number,
  "offDutyAmount": number,
  "grossSales": number,
  "netSales": number,
  "discounts": number,
  "tax": number,
  "refunds": number,
  "transactionCount": number,
  "paymentBreakdown": { "cash": number, "card": number, "ewallet": number },
  "notes": "short explanation of assumptions or missing data",
  "confidence": number
}

Rules:
- Use Malaysian Ringgit amounts as plain numbers.
- If a field is not visible, use null instead of guessing.
- reportDate must be the shift start date. If Start Time is 2026-04-21 and Time/Date printed at the top is 2026-04-22, use 2026-04-21.
- cashierName comes from the Casher/Cashier label.
- shiftIncome is the canonical revenue amount for this report.
- netSales and grossSales should equal shiftIncome unless the report clearly gives a better sales total.
- discounts should equal Freebies when no separate discount total exists.
- refunds should equal Refund Balance.
- itemsSales maps from the Items row under Items/Stock.
- Preserve pointRedemption as a numeric amount/count exactly as shown.
- confidence must reflect OCR/readability and whether totals reconcile.`;

function parseModelJson(content: unknown): unknown | null {
  if (!content) return null;
  if (typeof content === "object") return content;
  if (typeof content !== "string") return null;

  const trimmed = content.trim();
  const withoutFences = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");

  try { return JSON.parse(withoutFences); } catch { /* fall through */ }

  const start = withoutFences.indexOf("{");
  const end = withoutFences.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try { return JSON.parse(withoutFences.slice(start, end + 1)); } catch { return null; }
  }

  return null;
}

export interface SalesReportPipelineState {
  documentId: string;
  document: SalesReportDocument | null;
  fileBytes: ArrayBuffer | null;
  fileMimeType: string | null;
  rawExtraction: unknown | null;
  normalized: NormalizedSalesReport | null;
  evaluation: PublishingEvaluation | null;
  report: DailySalesReport | null;
  error: string | null;
}

const SalesReportState = Annotation.Root({
  documentId: Annotation<string>,
  document: Annotation<SalesReportDocument | null>,
  fileBytes: Annotation<ArrayBuffer | null>,
  fileMimeType: Annotation<string | null>,
  rawExtraction: Annotation<unknown | null>,
  normalized: Annotation<NormalizedSalesReport | null>,
  evaluation: Annotation<PublishingEvaluation | null>,
  report: Annotation<DailySalesReport | null>,
  error: Annotation<string | null>,
});

async function loadDocumentNode(state: typeof SalesReportState.State) {
  try {
    const client = supabase();
    const { data: document, error } = await client
      .from("sales_report_documents")
      .select("*")
      .eq("id", state.documentId)
      .single();

    if (error || !document) {
      return { error: error?.message ?? "Sales report document not found" };
    }

    await client
      .from("sales_report_documents")
      .update({
        status: "processing",
        extraction_errors: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", state.documentId);

    return { document } as Partial<typeof SalesReportState.State>;
  } catch (err) {
    return { error: (err as Error).message };
  }
}

async function downloadFileNode(state: typeof SalesReportState.State) {
  if (!state.document) return {};

  try {
    const client = supabase();
    const { data: fileData, error } = await client.storage
      .from(state.document.storage_bucket)
      .download(state.document.storage_path);

    if (error || !fileData) {
      return { error: error?.message ?? "Failed to download sales report file" };
    }

    return {
      fileBytes: await fileData.arrayBuffer(),
      fileMimeType: state.document.file_type,
    };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

async function extractNode(state: typeof SalesReportState.State) {
  if (!state.fileBytes || !state.fileMimeType) {
    return { error: "No file data available for extraction" };
  }

  try {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) {
      return { error: "Missing GOOGLE_GENERATIVE_AI_API_KEY" };
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: process.env.GOOGLE_GENERATIVE_AI_MODEL || "gemini-2.5-flash",
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
      },
    });

    const base64 = Buffer.from(state.fileBytes).toString("base64");
    const result = await model.generateContent([
      { text: EXTRACTION_PROMPT },
      { inlineData: { mimeType: state.fileMimeType, data: base64 } },
    ]);

    const rawText = result.response.text();
    const raw = parseModelJson(rawText);

    if (!raw) {
      return { error: "Gemini returned an invalid JSON payload" };
    }

    return { rawExtraction: raw };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

async function normalizeNode(state: typeof SalesReportState.State) {
  if (!state.rawExtraction) {
    return { error: "No extraction data to normalize" };
  }

  try {
    const normalized = normalizeExtractedSalesReport(state.rawExtraction);
    return { normalized };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

async function evaluateNode(state: typeof SalesReportState.State) {
  if (!state.normalized) {
    return { error: "No normalized data to evaluate" };
  }

  try {
    if (!state.normalized.reportDate) {
      const warnings = [...state.normalized.validationWarnings];
      const evaluation: PublishingEvaluation = {
        status: "needs_review",
        isPublished: false,
        warnings,
      };

      return { evaluation };
    }

    const client = supabase();
    let hasDuplicatePublishedDate = false;
    const { data: existing } = await client
      .from("daily_sales_reports")
      .select("id")
      .eq("report_date", state.normalized.reportDate)
      .eq("is_published", true)
      .neq("source_document_id", state.documentId)
      .limit(1)
      .maybeSingle();

    if (existing) {
      hasDuplicatePublishedDate = true;
    }

    const evaluation = evaluateSalesReportForPublishing(state.normalized, {
      hasPublishedReportForDate: hasDuplicatePublishedDate,
    });

    return { evaluation };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

function decidePublishCondition(state: typeof SalesReportState.State) {
  if (state.error) return "markFailed";

  if (state.evaluation?.isPublished) return "publish";

  if (
    state.evaluation?.status === "needs_review" &&
    state.normalized?.reportDate
  ) {
    return "saveNeedsReview";
  }

  return "markNeedsReview";
}

async function publishNode(state: typeof SalesReportState.State) {
  if (!state.normalized || !state.evaluation) {
    return { error: "Missing data for publish step" };
  }

  try {
    const client = supabase();
    const payload = toDailySalesReportInsert(
      state.documentId,
      state.normalized,
      state.evaluation
    );

    const { data: report, error } = await client
      .from("daily_sales_reports")
      .upsert(payload, { onConflict: "source_document_id" })
      .select()
      .single();

    if (error) throw error;

    await client
      .from("sales_report_documents")
      .update({
        status: state.evaluation.status,
        confidence_score: state.normalized.confidenceScore,
        raw_extraction: state.rawExtraction,
        extraction_errors: state.evaluation.warnings,
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", state.documentId);

    return { report } as Partial<typeof SalesReportState.State>;
  } catch (err) {
    return { error: (err as Error).message };
  }
}

async function saveNeedsReviewNode(state: typeof SalesReportState.State) {
  if (!state.normalized || !state.evaluation) {
    return { error: "Missing data for save step" };
  }

  try {
    const client = supabase();
    const payload = toDailySalesReportInsert(
      state.documentId,
      state.normalized,
      state.evaluation
    );

    await client
      .from("daily_sales_reports")
      .upsert(payload, { onConflict: "source_document_id" })
      .select()
      .single();

    await client
      .from("sales_report_documents")
      .update({
        status: "needs_review",
        confidence_score: state.normalized.confidenceScore,
        raw_extraction: state.rawExtraction,
        extraction_errors: state.evaluation.warnings,
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", state.documentId);

    return {};
  } catch (err) {
    return { error: (err as Error).message };
  }
}

async function markNeedsReviewNode(state: typeof SalesReportState.State) {
  try {
    const client = supabase();
    await client
      .from("sales_report_documents")
      .update({
        status: "needs_review",
        confidence_score: state.normalized?.confidenceScore ?? 0,
        raw_extraction: state.rawExtraction,
        extraction_errors: state.normalized?.validationWarnings ?? state.evaluation?.warnings ?? [],
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", state.documentId);

    return {};
  } catch (err) {
    return { error: (err as Error).message };
  }
}

async function markFailedNode(state: typeof SalesReportState.State) {
  try {
    const client = supabase();
    await client
      .from("sales_report_documents")
      .update({
        status: "failed",
        extraction_errors: [state.error ?? "Unknown extraction error"],
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", state.documentId);

    return {};
  } catch (err) {
    return { error: (err as Error).message };
  }
}

function createSalesReportGraph() {
  const workflow = new StateGraph(SalesReportState)
    .addNode("loadDocument", loadDocumentNode)
    .addNode("downloadFile", downloadFileNode)
    .addNode("extract", extractNode)
    .addNode("normalize", normalizeNode)
    .addNode("evaluate", evaluateNode)
    .addNode("publish", publishNode)
    .addNode("saveNeedsReview", saveNeedsReviewNode)
    .addNode("markNeedsReview", markNeedsReviewNode)
    .addNode("markFailed", markFailedNode)
    .addEdge("__start__", "loadDocument")
    .addEdge("loadDocument", "downloadFile")
    .addEdge("downloadFile", "extract")
    .addEdge("extract", "normalize")
    .addEdge("normalize", "evaluate")
    .addConditionalEdges("evaluate", decidePublishCondition, {
      publish: "publish",
      saveNeedsReview: "saveNeedsReview",
      markNeedsReview: "markNeedsReview",
      markFailed: "markFailed",
    })
    .addEdge("publish", END)
    .addEdge("saveNeedsReview", END)
    .addEdge("markNeedsReview", END)
    .addEdge("markFailed", END);

  return workflow.compile({ checkpointer: new MemorySaver() });
}

let pipelineInstance: ReturnType<typeof createSalesReportGraph> | null = null;

function getSalesReportPipeline() {
  if (!pipelineInstance) {
    pipelineInstance = createSalesReportGraph();
  }
  return pipelineInstance;
}

export interface SalesReportPipelineResult {
  document: SalesReportDocument | null;
  report: DailySalesReport | null;
  rawExtraction: unknown | null;
  status: string;
  error: string | null;
}

export async function runSalesReportPipeline(
  documentId: string
): Promise<SalesReportPipelineResult> {
  const pipeline = getSalesReportPipeline();

  try {
    const result = await pipeline.invoke(
      { documentId },
      { configurable: { thread_id: `sr-${documentId}` } }
    );

    const state = result as typeof SalesReportState.State;

    if (state.error) {
      return {
        document: state.document,
        report: null,
        rawExtraction: state.rawExtraction,
        status: "failed",
        error: state.error,
      };
    }

    let status = "completed";
    if (state.evaluation?.status === "auto_published") {
      status = "auto_published";
    } else if (state.evaluation?.status === "needs_review") {
      status = "needs_review";
    }

    return {
      document: state.document,
      report: state.report ?? null,
      rawExtraction: state.rawExtraction,
      status,
      error: null,
    };
  } catch (err) {
    return {
      document: null,
      report: null,
      rawExtraction: null,
      status: "failed",
      error: (err as Error).message,
    };
  }
}
