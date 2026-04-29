import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface SalesReportSummary {
  period: string;
  publishedCount: number;
  totalDocuments: number;
  grossSalesTotal: number;
  netSalesTotal: number;
  shiftIncomeTotal: number;
  transactionCount: number;
  averageTicket: number;
  paymentBreakdown: Record<string, number>;
  reportDates: string[];
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Admin authentication required" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const year = searchParams.get("year") ?? String(new Date().getFullYear());
    const month = searchParams.get("month") ?? String(new Date().getMonth() + 1);

    const yearNum = parseInt(year, 10);
    const monthNum = parseInt(month, 10);

    if (isNaN(yearNum) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      return NextResponse.json({ error: "Invalid year or month" }, { status: 400 });
    }

    const monthStr = String(monthNum).padStart(2, "0");
    const startDate = `${yearNum}-${monthStr}-01`;
    const lastDay = new Date(yearNum, monthNum, 0).getDate();
    const endDate = `${yearNum}-${monthStr}-${String(lastDay).padStart(2, "0")}`;

    const period = `${yearNum}-${monthStr}`;

    const [publishedResult, totalResult] = await Promise.all([
      supabase
        .from("daily_sales_reports")
        .select("*")
        .eq("is_published", true)
        .gte("report_date", startDate)
        .lte("report_date", endDate)
        .order("report_date", { ascending: true }),
      supabase
        .from("sales_report_documents")
        .select("id", { count: "exact" })
        .gte("created_at", `${startDate}T00:00:00Z`)
        .lte("created_at", `${endDate}T23:59:59Z`),
    ]);

    if (publishedResult.error) {
      throw publishedResult.error;
    }

    if (totalResult.error) {
      throw totalResult.error;
    }

    const reports = publishedResult.data ?? [];
    let grossSalesTotal = 0;
    let netSalesTotal = 0;
    let shiftIncomeTotal = 0;
    let transactionCount = 0;
    const paymentBreakdown: Record<string, number> = {};
    const reportDates: string[] = [];

    for (const report of reports) {
      const gs = typeof report.gross_sales === "number" ? report.gross_sales : 0;
      const ns = typeof report.net_sales === "number" ? report.net_sales : 0;
      const si = typeof report.shift_income === "number" ? report.shift_income : 0;
      const tc = typeof report.transaction_count === "number" ? report.transaction_count : 0;

      grossSalesTotal += gs;
      netSalesTotal += ns;
      shiftIncomeTotal += si;
      transactionCount += tc;

      if (report.report_date) {
        reportDates.push(report.report_date);
      }

      const breakdown = report.payment_breakdown as Record<string, number> | null;

      if (breakdown && typeof breakdown === "object") {
        for (const [key, value] of Object.entries(breakdown)) {
          const numericValue = typeof value === "number" ? value : 0;
          paymentBreakdown[key] = (paymentBreakdown[key] ?? 0) + numericValue;
        }
      }
    }

    const publishedCount = reports.length;
    const averageTicket = transactionCount > 0 ? grossSalesTotal / transactionCount : 0;

    const result: SalesReportSummary = {
      period,
      publishedCount,
      totalDocuments: totalResult.count ?? 0,
      grossSalesTotal: Math.round(grossSalesTotal * 100) / 100,
      netSalesTotal: Math.round(netSalesTotal * 100) / 100,
      shiftIncomeTotal: Math.round(shiftIncomeTotal * 100) / 100,
      transactionCount,
      averageTicket: Math.round(averageTicket * 100) / 100,
      paymentBreakdown,
      reportDates,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to load sales report summary:", error);
    return NextResponse.json({ error: "Failed to load sales report summary" }, { status: 500 });
  }
}
