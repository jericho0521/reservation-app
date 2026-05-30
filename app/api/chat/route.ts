import { NextResponse } from "next/server";
import { z } from "zod";
import { getRelevantContext } from "@/lib/knowledge";
import {
  getChatDomainGuardResponse,
  getLocationDirectionsAction,
  runChatAgent,
  createBooking,
  type ChatMessage,
  type ChatAction,
} from "@/lib/langchain/chat-agent";

const confirmBookingSchema = z.object({
  service: z.string().trim().min(1),
  date: z.string().trim().min(1),
  time: z.string().trim().min(1),
  seats: z.number().int().positive(),
  name: z.string().trim().min(1),
  email: z.string().trim().email(),
  phone: z.string().trim().min(1),
});

interface ChatRequestBody {
  messages?: unknown;
  confirmBooking?: unknown;
  threadId?: unknown;
}

type ConfirmBookingPayload = z.infer<typeof confirmBookingSchema>;

export function parseConfirmBookingPayload(value: unknown): ConfirmBookingPayload | null {
  const result = confirmBookingSchema.safeParse(value);
  return result.success ? result.data : null;
}

function getChatRequestBody(value: unknown): ChatRequestBody {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as ChatRequestBody
    : {};
}

export async function POST(req: Request) {
  try {
    const body = getChatRequestBody(await req.json());
    const messages = (Array.isArray(body.messages) ? body.messages : []) as ChatMessage[];
    const threadId = typeof body.threadId === "string" ? body.threadId : undefined;

    if (body.confirmBooking !== undefined) {
      const confirmBooking = parseConfirmBookingPayload(body.confirmBooking);

      if (!confirmBooking) {
        return NextResponse.json({
          content: "Sorry, the booking confirmation details are incomplete. Please restart the booking and include your phone number.",
          action: null,
          threadId: threadId || crypto.randomUUID(),
        }, { status: 400 });
      }

      const result = await createBooking(
        confirmBooking.service,
        confirmBooking.date,
        confirmBooking.time,
        confirmBooking.seats,
        confirmBooking.name,
        confirmBooking.email,
        confirmBooking.phone
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
        threadId: threadId || crypto.randomUUID(),
      });
    }

    const locationAction = getLocationDirectionsAction(latestUserMessage);
    if (locationAction) {
      return Response.json({
        content: `We are located at ${locationAction.data.area}. You can open the directions card below for Waze or Google Maps navigation.`,
        action: locationAction,
        threadId: threadId || crypto.randomUUID(),
      });
    }

    const context = latestUserMessage ? await getRelevantContext(latestUserMessage) : "";

    const chatThreadId = threadId || crypto.randomUUID();

    const result = await runChatAgent(messages, context, chatThreadId);

    return Response.json({
      content: result.content,
      action: result.action,
      threadId: chatThreadId,
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
