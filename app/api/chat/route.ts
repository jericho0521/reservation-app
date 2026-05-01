import { NextResponse } from "next/server";
import { getRelevantContext } from "@/lib/knowledge";
import {
  getChatDomainGuardResponse,
  getLocationDirectionsAction,
  runChatAgent,
  createBooking,
  type ChatMessage,
  type ChatAction,
} from "@/lib/langchain/chat-agent";

interface ConfirmBookingPayload {
  service: string;
  date: string;
  time: string;
  seats: number;
  name: string;
  email: string;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const messages = (Array.isArray(body.messages) ? body.messages : []) as ChatMessage[];
    const confirmBooking = body.confirmBooking as ConfirmBookingPayload | undefined;

    if (confirmBooking) {
      const result = await createBooking(
        confirmBooking.service,
        confirmBooking.date,
        confirmBooking.time,
        confirmBooking.seats,
        confirmBooking.name,
        confirmBooking.email
      );

      return Response.json({
        content: result.success
          ? `Great! Your booking is confirmed! 🎉 You've booked ${confirmBooking.seats} seat(s) for ${confirmBooking.service} on ${confirmBooking.date} at ${confirmBooking.time}. A confirmation will be sent to ${confirmBooking.email}.`
          : `Sorry, there was an issue: ${result.error}`,
        action: result.success
          ? ({ type: "booking_success", data: confirmBooking } as ChatAction)
          : null,
      });
    }

    const latestUserMessage =
      [...messages].reverse().find((m) => m.role === "user")?.content || "";
    const guardResponse = getChatDomainGuardResponse(latestUserMessage);
    if (guardResponse) {
      return Response.json({
        content: guardResponse,
        action: null,
        threadId: body.threadId || crypto.randomUUID(),
      });
    }

    const locationAction = getLocationDirectionsAction(latestUserMessage);
    if (locationAction) {
      return Response.json({
        content: `We are located at ${locationAction.data.area}. You can open the directions card below for Waze or Google Maps navigation.`,
        action: locationAction,
        threadId: body.threadId || crypto.randomUUID(),
      });
    }

    const context = latestUserMessage ? await getRelevantContext(latestUserMessage) : "";

    const threadId = body.threadId || crypto.randomUUID();

    const result = await runChatAgent(messages, context, threadId);

    return Response.json({
      content: result.content,
      action: result.action,
      threadId,
    });
  } catch (error) {
    console.error("Chat route error:", error);
    const errorText = error instanceof Error ? error.message : String(error);
    const isRateLimit =
      errorText.includes("429") ||
      errorText.includes("quota") ||
      errorText.includes("RESOURCE_EXHAUSTED");
    const userMessage = isRateLimit
      ? "I'm receiving too many requests right now. Please wait a moment and try again."
      : "Something went wrong. Please try again.";
    return NextResponse.json({ content: userMessage }, { status: 200 });
  }
}
