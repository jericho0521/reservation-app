import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getRelevantContext } from '@/lib/knowledge';
import { getBookingConfirmationContent } from './booking-confirmation-response';
import { getChatDomainGuardResponse, getHumanSupportAction, getLocationDirectionsAction, runChatAgent, createBooking } from '@/lib/langchain/chat-agent';
import { parseConfirmBookingPayload } from './confirm-booking';
import { readLimitedJson, RequestBodyError } from '@/lib/request-body';
import { consumeBudget, hashRequestValue, requestSource, RequestControlError } from '@/lib/request-controls';
import { getChatSession, chatResponse, issueBookingProof, verifyBookingProof } from '@/lib/chat-session';

const requestSchema = z.object({
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(2000) })).max(20).default([]),
  confirmBooking: z.unknown().optional(),
  threadId: z.string().max(128).optional(),
});

export async function POST(req: Request) {
  try {
    const body = requestSchema.parse(await readLimitedJson(req));
    const session = getChatSession(req);
    const threadId = session.id;
    const respond = (value: object, status = 200) => chatResponse(session, { ...value, threadId }, status);
    const source = requestSource(req);
    await consumeBudget(['0-global:chat', `chat-ip:${source}`, `chat-session:${session.id}`], [500, 30, 30], 900);

    await consumeBudget(['0-global:chat-daily'], [1000], 86400);

    if (body.confirmBooking !== undefined) {
      const booking = parseConfirmBookingPayload(body.confirmBooking);
      const token = body.confirmBooking && typeof body.confirmBooking === 'object' ? (body.confirmBooking as Record<string, unknown>).confirmationToken : undefined;
      const nonce = booking && verifyBookingProof(token, session.id, booking);
      if (!booking || !nonce) return respond({ content: 'This confirmation is invalid or expired. Please prepare the booking again.', action: null }, 400);
      const result = await createBooking(booking.service, booking.date, booking.time, booking.endTime, booking.seats, booking.name, booking.email, booking.phone, {
        actor: hashRequestValue(session.id), source, key: nonce,
      });
      return respond({
        content: getBookingConfirmationContent(booking, result),
        action: result.success ? { type: 'booking_success', data: { ...booking, bookingId: result.booking_id, emailSent: result.email_sent } } : null,
      });
    }
    const latest = [...body.messages].reverse().find(message => message.role === 'user')?.content;
    if (!latest) return respond({ content: 'A user message is required.', action: null }, 400);
    const support = getHumanSupportAction(latest);
    if (support) return respond({ content: 'You can talk directly with the Project Play by CW team on WhatsApp. Tap below to open a pre-filled chat.', action: support });
    const guard = getChatDomainGuardResponse(latest);
    if (guard) return respond({ content: guard, action: null });
    const location = getLocationDirectionsAction(latest);
    if (location) return respond({ content: `We are located at ${location.data.area}. You can open the directions card below for Waze or Google Maps navigation.`, action: location });
    const context = (await getRelevantContext(latest)).slice(0, 12000);
    const result = await runChatAgent(body.messages, context, threadId);
    if (result.action?.type === 'booking_confirmation') {
      const booking = parseConfirmBookingPayload(result.action.data);
      if (!booking) return respond({ content: 'Please provide complete booking details.', action: null });
      result.action.data = { ...booking, confirmationToken: issueBookingProof(session.id, booking) };
    }
    return respond({ content: result.content, action: result.action });
  } catch (error) {
    const status = error instanceof RequestControlError || error instanceof RequestBodyError ? error.status : error instanceof z.ZodError || error instanceof SyntaxError ? 400 : 503;
    return NextResponse.json({ content: status === 429 ? 'Too many requests. Please wait before trying again.' : status === 400 ? 'Invalid chat request.' : 'Chat is temporarily unavailable. Please try again.' }, { status });
  }
}
