import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateSalesReportForPublishing,
  normalizeExtractedSalesReport,
  validateSalesReportFile,
} from "./sales-reports";

test("normalizeExtractedSalesReport parses dates, RM amounts, payments, and confidence", () => {
  const report = normalizeExtractedSalesReport({
    reportDate: "2026-04-24",
    cashierName: "M",
    shiftStartAt: "2026-04-24 01:30:00",
    shiftEndAt: "2026-04-25 01:45:00",
    topupRegisterAmount: "RM 1,000.50",
    itemsSales: "250",
    refundBalance: "20",
    userPurchase: "0",
    otherExpenses: "0",
    shiftIncome: "1,230.50",
    totalCash: "1,230.50",
    offDutyAmount: "1,230.50",
    grossSales: "RM 1,250.50",
    netSales: "RM 1,180.50",
    discounts: "50",
    tax: "0",
    refunds: "20",
    transactionCount: "42 transactions",
    paymentBreakdown: {
      Cash: "RM 300.50",
      Card: "880",
    },
    notes: "Clear report",
    confidence: 0.91,
  });

  assert.equal(report.reportDate, "2026-04-24");
  assert.equal(report.cashierName, "M");
  assert.equal(report.topupRegisterAmount, 1000.5);
  assert.equal(report.itemsSales, 250);
  assert.equal(report.shiftIncome, 1230.5);
  assert.equal(report.totalCash, 1230.5);
  assert.equal(report.grossSales, 1250.5);
  assert.equal(report.netSales, 1180.5);
  assert.equal(report.discounts, 50);
  assert.equal(report.refunds, 20);
  assert.equal(report.transactionCount, 42);
  assert.deepEqual(report.paymentBreakdown, {
    cash: 300.5,
    card: 880,
  });
  assert.equal(report.confidenceScore, 0.91);
  assert.deepEqual(report.validationWarnings, []);
});

test("evaluateSalesReportForPublishing auto-publishes high-confidence valid reports", () => {
  const report = normalizeExtractedSalesReport({
    reportDate: "2026-04-24",
    topupRegisterAmount: 75,
    itemsSales: 25,
    shiftIncome: 100,
    totalCash: 100,
    receivedFromLastShift: 0,
    offDutyAmount: 100,
    transactionCount: 5,
    confidence: 0.9,
  });

  assert.deepEqual(evaluateSalesReportForPublishing(report), {
    status: "auto_published",
    isPublished: true,
    warnings: [],
  });
});

test("evaluateSalesReportForPublishing requires review for low confidence or duplicate dates", () => {
  const report = normalizeExtractedSalesReport({
    reportDate: "2026-04-24",
    shiftIncome: 100,
    confidence: 0.7,
  });

  assert.deepEqual(evaluateSalesReportForPublishing(report), {
    status: "needs_review",
    isPublished: false,
    warnings: [],
  });

  assert.deepEqual(evaluateSalesReportForPublishing(report, { hasPublishedReportForDate: true }), {
    status: "needs_review",
    isPublished: false,
    warnings: ["A published sales report already exists for this date."],
  });
});

test("validateSalesReportFile rejects unsupported files", () => {
  assert.equal(
    validateSalesReportFile({ name: "report.txt", type: "text/plain", size: 100 }),
    "Upload a PDF, JPG, PNG, or WebP sales report.",
  );
  assert.equal(validateSalesReportFile({ name: "report.pdf", type: "application/pdf", size: 100 }), null);
});
