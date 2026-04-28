import { NextResponse } from "next/server";
import { runAnalyticsAgent } from "@/lib/langchain/analytics-agent";

export async function POST(req: Request) {
  try {
    const { prompt, previousQuery, filters, threadId } = await req.json();

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    const effectiveThreadId = threadId || crypto.randomUUID();

    const { spec, fallbackDashboard } = await runAnalyticsAgent(
      prompt,
      effectiveThreadId,
      typeof previousQuery === "string" ? previousQuery : undefined,
      filters && typeof filters === "object"
        ? (filters as Record<string, unknown>)
        : undefined
    );

    return NextResponse.json({
      spec,
      fallbackDashboard,
      threadId: effectiveThreadId,
    });
  } catch (error) {
    console.error("Analytics chat error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
