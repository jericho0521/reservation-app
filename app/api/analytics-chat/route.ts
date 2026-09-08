import { z } from "zod";
import { NextResponse } from "next/server";
import { requireAdminSupabase } from "@/app/api/api-utils";
import { runAnalyticsAgent } from "@/lib/langchain/analytics-agent";

export async function POST(req: Request) {
  try {
    const { response, supabase } = await requireAdminSupabase();
    if (response) return response;

    const { prompt, previousQuery, filters, threadId } = await req.json();

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    const parsedFilters = z.object({
      service: z.string().max(100).optional(),
      status: z.enum(['all', 'confirmed', 'in_progress', 'completed', 'cancelled', 'pending']).optional(),
    }).strict().safeParse(filters ?? {});
    if (!parsedFilters.success) return NextResponse.json({ error: "Unsupported analytics filters" }, { status: 400 });

    const effectiveThreadId = threadId || crypto.randomUUID();

    const { spec, fallbackDashboard } = await runAnalyticsAgent(
      prompt,
      effectiveThreadId,
      typeof previousQuery === "string" ? previousQuery : undefined,
      parsedFilters.data,
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
