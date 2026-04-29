import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { runAnalyticsAgent } from "@/lib/langchain/analytics-agent";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Admin authentication required" }, { status: 401 });
    }

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
        : undefined,
      supabase
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
