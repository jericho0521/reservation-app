import { z } from "zod";

export const SALES_REPORT_BUCKET = "sales-report-documents";
export const SALES_REPORT_AUTO_PUBLISH_CONFIDENCE = 0.85;

export const salesReportDocumentStatuses = [
  "pending",
  "processing",
  "auto_published",
  "needs_review",
  "published",
  "failed",
] as const;

export type SalesReportDocumentStatus = typeof salesReportDocumentStatuses[number];

export const SUPPORTED_SALES_REPORT_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export interface SalesReportDocument {
  id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  storage_bucket: string;
  storage_path: string;
  status: SalesReportDocumentStatus;
  confidence_score: number | null;
  raw_extraction: unknown | null;
  extraction_errors: string[] | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
  processed_at: string | null;
}

export interface DailySalesReport {
  id: string;
  source_document_id: string;
  report_date: string;
  cashier_name: string | null;
  shift_start_at: string | null;
  shift_end_at: string | null;
  topup_register_amount: number | null;
  freebies: number | null;
  deducted_amount: number | null;
  refund_balance: number | null;
  cashier_m_plus: number | null;
  cashier_user_m_plus: number | null;
  items_sales: number | null;
  user_purchase: number | null;
  free_items: number | null;
  point_redemption: number | null;
  cash_stock_in: number | null;
  received_from_last_shift: number | null;
  reserve_to_next_duty: number | null;
  reload_coupon: number | null;
  card_fee_registered: number | null;
  other_expenses: number | null;
  shift_income: number | null;
  total_cash: number | null;
  off_duty_amount: number | null;
  gross_sales: number | null;
  net_sales: number | null;
  discounts: number | null;
  tax: number | null;
  refunds: number | null;
  transaction_count: number | null;
  payment_breakdown: Record<string, number>;
  notes: string | null;
  confidence_score: number | null;
  validation_warnings: string[];
  is_published: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

const currencyLikeSchema = z.union([z.number(), z.string(), z.null()]).optional();

export const extractedSalesReportSchema = z.object({
  reportDate: z.string().optional().nullable(),
  cashierName: z.string().optional().nullable(),
  shiftStartAt: z.string().optional().nullable(),
  shiftEndAt: z.string().optional().nullable(),
  topupRegisterAmount: currencyLikeSchema,
  freebies: currencyLikeSchema,
  deductedAmount: currencyLikeSchema,
  refundBalance: currencyLikeSchema,
  cashierMPlus: currencyLikeSchema,
  cashierUserMPlus: currencyLikeSchema,
  itemsSales: currencyLikeSchema,
  userPurchase: currencyLikeSchema,
  freeItems: currencyLikeSchema,
  pointRedemption: currencyLikeSchema,
  cashStockIn: currencyLikeSchema,
  receivedFromLastShift: currencyLikeSchema,
  reserveToNextDuty: currencyLikeSchema,
  reloadCoupon: currencyLikeSchema,
  cardFeeRegistered: currencyLikeSchema,
  otherExpenses: currencyLikeSchema,
  shiftIncome: currencyLikeSchema,
  totalCash: currencyLikeSchema,
  offDutyAmount: currencyLikeSchema,
  grossSales: currencyLikeSchema,
  netSales: currencyLikeSchema,
  discounts: currencyLikeSchema,
  tax: currencyLikeSchema,
  refunds: currencyLikeSchema,
  transactionCount: z.union([z.number(), z.string(), z.null()]).optional(),
  paymentBreakdown: z
    .preprocess(
      (v) => (v === null ? undefined : v),
      z.record(currencyLikeSchema).optional(),
    )
    .default({}),
  notes: z.string().optional().nullable(),
  confidence: z.number().min(0).max(1).optional().nullable(),
  fieldConfidence: z
    .preprocess(
      (v) => (v === null ? undefined : v),
      z.record(z.number().min(0).max(1)).optional(),
    )
    .default({}),
});

export type ExtractedSalesReport = z.infer<typeof extractedSalesReportSchema>;

export interface NormalizedSalesReport {
  reportDate: string | null;
  cashierName: string | null;
  shiftStartAt: string | null;
  shiftEndAt: string | null;
  topupRegisterAmount: number | null;
  freebies: number | null;
  deductedAmount: number | null;
  refundBalance: number | null;
  cashierMPlus: number | null;
  cashierUserMPlus: number | null;
  itemsSales: number | null;
  userPurchase: number | null;
  freeItems: number | null;
  pointRedemption: number | null;
  cashStockIn: number | null;
  receivedFromLastShift: number | null;
  reserveToNextDuty: number | null;
  reloadCoupon: number | null;
  cardFeeRegistered: number | null;
  otherExpenses: number | null;
  shiftIncome: number | null;
  totalCash: number | null;
  offDutyAmount: number | null;
  grossSales: number | null;
  netSales: number | null;
  discounts: number | null;
  tax: number | null;
  refunds: number | null;
  transactionCount: number | null;
  paymentBreakdown: Record<string, number>;
  notes: string | null;
  confidenceScore: number;
  validationWarnings: string[];
}

export interface PublishingEvaluation {
  status: Extract<SalesReportDocumentStatus, "auto_published" | "needs_review">;
  isPublished: boolean;
  warnings: string[];
}

export function validateSalesReportFile(file: { type: string; size: number; name: string }) {
  const maxBytes = 10 * 1024 * 1024;

  if (!SUPPORTED_SALES_REPORT_MIME_TYPES.includes(file.type as typeof SUPPORTED_SALES_REPORT_MIME_TYPES[number])) {
    return "Upload a PDF, JPG, PNG, or WebP sales report.";
  }

  if (file.size <= 0) {
    return "Upload a non-empty sales report file.";
  }

  if (file.size > maxBytes) {
    return "Sales report files must be 10MB or smaller.";
  }

  if (!file.name.trim()) {
    return "Sales report file name is required.";
  }

  return null;
}

export function parseModelJson(content: unknown): unknown | null {
  if (!content) {
    return null;
  }

  if (typeof content === "object") {
    return content;
  }

  if (typeof content !== "string") {
    return null;
  }

  const trimmed = content.trim();
  const withoutFences = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");

  try {
    return JSON.parse(withoutFences);
  } catch {
    // Continue with recovery below.
  }

  const start = withoutFences.indexOf("{");
  const end = withoutFences.lastIndexOf("}");

  if (start >= 0 && end > start) {
    try {
      return JSON.parse(withoutFences.slice(start, end + 1));
    } catch {
      return null;
    }
  }

  return null;
}

export function parseCurrencyValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? roundCurrency(value) : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value
    .replace(/rm/gi, "")
    .replace(/[,\s]/g, "")
    .replace(/[^\d.-]/g, "");

  if (!normalized || normalized === "-" || normalized === ".") {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? roundCurrency(parsed) : null;
}

export function parseTransactionCount(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const parsed = Number(value.replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : null;
}

export function normalizeReportDate(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const parsed = new Date(trimmed);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
}

export function normalizeDateTime(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  const normalized = trimmed
    .replace(/\s+AM$/i, " AM")
    .replace(/\s+PM$/i, " PM");
  const parsed = new Date(normalized);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

export function normalizePaymentBreakdown(
  paymentBreakdown: ExtractedSalesReport["paymentBreakdown"],
): Record<string, number> {
  const normalized: Record<string, number> = {};

  for (const [key, value] of Object.entries(paymentBreakdown ?? {})) {
    const parsedValue = parseCurrencyValue(value);

    if (parsedValue !== null) {
      normalized[normalizePaymentLabel(key)] = parsedValue;
    }
  }

  return normalized;
}

export function normalizeExtractedSalesReport(input: unknown): NormalizedSalesReport {
  if (input && typeof input === "object" && "paymentBreakdown" in input && (input as Record<string, unknown>).paymentBreakdown === null) {
    (input as Record<string, unknown>).paymentBreakdown = {};
  }
  const extracted = extractedSalesReportSchema.parse(input);
  const topupRegisterAmount = parseCurrencyValue(extracted.topupRegisterAmount);
  const freebies = parseCurrencyValue(extracted.freebies);
  const deductedAmount = parseCurrencyValue(extracted.deductedAmount);
  const refundBalance = parseCurrencyValue(extracted.refundBalance);
  const cashierMPlus = parseCurrencyValue(extracted.cashierMPlus);
  const cashierUserMPlus = parseCurrencyValue(extracted.cashierUserMPlus);
  const itemsSales = parseCurrencyValue(extracted.itemsSales);
  const userPurchase = parseCurrencyValue(extracted.userPurchase);
  const freeItems = parseCurrencyValue(extracted.freeItems);
  const pointRedemption = parseCurrencyValue(extracted.pointRedemption);
  const cashStockIn = parseCurrencyValue(extracted.cashStockIn);
  const receivedFromLastShift = parseCurrencyValue(extracted.receivedFromLastShift);
  const reserveToNextDuty = parseCurrencyValue(extracted.reserveToNextDuty);
  const reloadCoupon = parseCurrencyValue(extracted.reloadCoupon);
  const cardFeeRegistered = parseCurrencyValue(extracted.cardFeeRegistered);
  const otherExpenses = parseCurrencyValue(extracted.otherExpenses);
  const shiftIncome = parseCurrencyValue(extracted.shiftIncome);
  const totalCash = parseCurrencyValue(extracted.totalCash);
  const offDutyAmount = parseCurrencyValue(extracted.offDutyAmount);
  const grossSales = parseCurrencyValue(extracted.grossSales) ?? shiftIncome;
  const netSales = parseCurrencyValue(extracted.netSales) ?? shiftIncome;
  const discounts = parseCurrencyValue(extracted.discounts) ?? freebies;
  const tax = parseCurrencyValue(extracted.tax);
  const refunds = parseCurrencyValue(extracted.refunds) ?? refundBalance;
  const transactionCount = parseTransactionCount(extracted.transactionCount);
  const reportDate = normalizeReportDate(extracted.reportDate);
  const shiftStartAt = normalizeDateTime(extracted.shiftStartAt);
  const shiftEndAt = normalizeDateTime(extracted.shiftEndAt);
  const paymentBreakdown = normalizePaymentBreakdown(extracted.paymentBreakdown);
  const validationWarnings = buildValidationWarnings({
    reportDate,
    topupRegisterAmount,
    refundBalance,
    itemsSales,
    userPurchase,
    otherExpenses,
    shiftIncome,
    totalCash,
    receivedFromLastShift,
    reserveToNextDuty,
    offDutyAmount,
    grossSales,
    netSales,
    discounts,
    tax,
    refunds,
    transactionCount,
    paymentBreakdown,
  });
  const confidenceScore = clampConfidence(extracted.confidence ?? inferConfidence(validationWarnings));

  return {
    reportDate,
    cashierName: extracted.cashierName?.trim() || null,
    shiftStartAt,
    shiftEndAt,
    topupRegisterAmount,
    freebies,
    deductedAmount,
    refundBalance,
    cashierMPlus,
    cashierUserMPlus,
    itemsSales,
    userPurchase,
    freeItems,
    pointRedemption,
    cashStockIn,
    receivedFromLastShift,
    reserveToNextDuty,
    reloadCoupon,
    cardFeeRegistered,
    otherExpenses,
    shiftIncome,
    totalCash,
    offDutyAmount,
    grossSales,
    netSales,
    discounts,
    tax,
    refunds,
    transactionCount,
    paymentBreakdown,
    notes: extracted.notes?.trim() || null,
    confidenceScore,
    validationWarnings,
  };
}

export function evaluateSalesReportForPublishing(
  report: NormalizedSalesReport,
  options: { hasPublishedReportForDate?: boolean } = {},
): PublishingEvaluation {
  const warnings = [...report.validationWarnings];

  if (options.hasPublishedReportForDate) {
    warnings.push("A published sales report already exists for this date.");
  }

  const hasBlockingWarning = warnings.some(warning =>
    warning.startsWith("Missing") ||
    warning.startsWith("Invalid") ||
    warning.includes("already exists")
  );
  const isPublished = report.confidenceScore >= SALES_REPORT_AUTO_PUBLISH_CONFIDENCE && !hasBlockingWarning;

  return {
    status: isPublished ? "auto_published" : "needs_review",
    isPublished,
    warnings,
  };
}

export function toDailySalesReportInsert(
  sourceDocumentId: string,
  report: NormalizedSalesReport,
  evaluation: Pick<PublishingEvaluation, "warnings" | "isPublished">,
) {
  return {
    source_document_id: sourceDocumentId,
    report_date: report.reportDate,
    cashier_name: report.cashierName,
    shift_start_at: report.shiftStartAt,
    shift_end_at: report.shiftEndAt,
    topup_register_amount: report.topupRegisterAmount,
    freebies: report.freebies,
    deducted_amount: report.deductedAmount,
    refund_balance: report.refundBalance,
    cashier_m_plus: report.cashierMPlus,
    cashier_user_m_plus: report.cashierUserMPlus,
    items_sales: report.itemsSales,
    user_purchase: report.userPurchase,
    free_items: report.freeItems,
    point_redemption: report.pointRedemption,
    cash_stock_in: report.cashStockIn,
    received_from_last_shift: report.receivedFromLastShift,
    reserve_to_next_duty: report.reserveToNextDuty,
    reload_coupon: report.reloadCoupon,
    card_fee_registered: report.cardFeeRegistered,
    other_expenses: report.otherExpenses,
    shift_income: report.shiftIncome,
    total_cash: report.totalCash,
    off_duty_amount: report.offDutyAmount,
    gross_sales: report.grossSales,
    net_sales: report.netSales,
    discounts: report.discounts,
    tax: report.tax,
    refunds: report.refunds,
    transaction_count: report.transactionCount,
    payment_breakdown: report.paymentBreakdown,
    notes: report.notes,
    confidence_score: report.confidenceScore,
    validation_warnings: evaluation.warnings,
    is_published: evaluation.isPublished,
    published_at: evaluation.isPublished ? new Date().toISOString() : null,
  };
}

function buildValidationWarnings(report: {
  reportDate: string | null;
  topupRegisterAmount: number | null;
  refundBalance: number | null;
  itemsSales: number | null;
  userPurchase: number | null;
  otherExpenses: number | null;
  shiftIncome: number | null;
  totalCash: number | null;
  receivedFromLastShift: number | null;
  reserveToNextDuty: number | null;
  offDutyAmount: number | null;
  grossSales: number | null;
  netSales: number | null;
  discounts: number | null;
  tax: number | null;
  refunds: number | null;
  transactionCount: number | null;
  paymentBreakdown: Record<string, number>;
}) {
  const warnings: string[] = [];

  if (!report.reportDate) {
    warnings.push("Missing report date.");
  }

  if (report.grossSales === null && report.netSales === null) {
    warnings.push("Missing sales total.");
  }

  if (report.shiftIncome === null && report.netSales === null) {
    warnings.push("Missing shift income.");
  }

  for (const [label, value] of [
    ["gross sales", report.grossSales],
    ["net sales", report.netSales],
    ["topup/register amount", report.topupRegisterAmount],
    ["refund balance", report.refundBalance],
    ["items sales", report.itemsSales],
    ["user purchase", report.userPurchase],
    ["other expenses", report.otherExpenses],
    ["shift income", report.shiftIncome],
    ["total cash", report.totalCash],
    ["off duty amount", report.offDutyAmount],
    ["discounts", report.discounts],
    ["tax", report.tax],
    ["refunds", report.refunds],
  ] as const) {
    if (value !== null && value < 0) {
      warnings.push(`Invalid negative ${label}.`);
    }
  }

  if (report.transactionCount !== null && report.transactionCount < 0) {
    warnings.push("Invalid negative transaction count.");
  }

  const paymentTotal = roundCurrency(Object.values(report.paymentBreakdown).reduce((sum, value) => sum + value, 0));
  const comparableSalesTotal = report.netSales ?? report.grossSales;

  if (paymentTotal > 0 && comparableSalesTotal !== null) {
    const difference = Math.abs(paymentTotal - comparableSalesTotal);

    if (difference > Math.max(1, comparableSalesTotal * 0.05)) {
      warnings.push("Payment breakdown does not match the extracted sales total.");
    }
  }

  if (
    report.grossSales !== null &&
    report.netSales !== null &&
    report.netSales > report.grossSales + (report.tax ?? 0) + 1
  ) {
    warnings.push("Net sales is higher than gross sales plus tax.");
  }

  if (
    report.shiftIncome !== null &&
    report.topupRegisterAmount !== null &&
    report.itemsSales !== null
  ) {
    const expectedShiftIncome = roundCurrency(
      report.topupRegisterAmount -
      (report.refundBalance ?? 0) +
      report.itemsSales -
      (report.userPurchase ?? 0) -
      (report.otherExpenses ?? 0),
    );

    if (Math.abs(expectedShiftIncome - report.shiftIncome) > 1) {
      warnings.push("Shift income does not match the report formula.");
    }
  }

  if (
    report.totalCash !== null &&
    report.shiftIncome !== null &&
    report.receivedFromLastShift !== null &&
    Math.abs(roundCurrency(report.shiftIncome + report.receivedFromLastShift) - report.totalCash) > 1
  ) {
    warnings.push("Total cash does not match shift income plus received from last shift.");
  }

  if (
    report.offDutyAmount !== null &&
    report.totalCash !== null &&
    Math.abs(roundCurrency(report.totalCash - (report.reserveToNextDuty ?? 0)) - report.offDutyAmount) > 1
  ) {
    warnings.push("Off duty amount does not match total cash minus reserve to next duty.");
  }

  return warnings;
}

function inferConfidence(warnings: string[]) {
  if (warnings.length === 0) {
    return SALES_REPORT_AUTO_PUBLISH_CONFIDENCE;
  }

  return Math.max(0.45, SALES_REPORT_AUTO_PUBLISH_CONFIDENCE - warnings.length * 0.12);
}

function clampConfidence(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, roundCurrency(value)));
}

function normalizePaymentLabel(label: string) {
  return label.trim().replace(/\s+/g, " ").toLowerCase();
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}
