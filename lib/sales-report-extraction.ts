import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  normalizeExtractedSalesReport,
  parseModelJson,
  type NormalizedSalesReport,
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

export interface SalesReportExtractionResult {
  normalized: NormalizedSalesReport;
  raw: unknown;
}

export async function extractSalesReportFromFile({
  bytes,
  mimeType,
}: {
  bytes: ArrayBuffer;
  mimeType: string;
}): Promise<SalesReportExtractionResult> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

  if (!apiKey) {
    throw new Error("Missing GOOGLE_GENERATIVE_AI_API_KEY");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: process.env.GOOGLE_GENERATIVE_AI_MODEL || "gemini-2.5-flash",
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
    },
  });
  const base64 = Buffer.from(bytes).toString("base64");
  const result = await model.generateContent([
    { text: EXTRACTION_PROMPT },
    {
      inlineData: {
        mimeType,
        data: base64,
      },
    },
  ]);
  const rawText = result.response.text();
  const raw = parseModelJson(rawText);

  if (!raw) {
    throw new Error("Gemini returned an invalid JSON payload");
  }

  return {
    normalized: normalizeExtractedSalesReport(raw),
    raw,
  };
}
