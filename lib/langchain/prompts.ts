import { ChatPromptTemplate } from '@langchain/core/prompts';
import { getMalaysiaDateString } from '@/lib/booking-schedule';
import {
  BOOKING_SYSTEM_TEMPLATE,
  renderBookingSystemPrompt,
} from '@/lib/chat-booking-prompt';

export { BOOKING_SYSTEM_TEMPLATE } from '@/lib/chat-booking-prompt';

export function buildBookingSystemPrompt(): string {
  return renderBookingSystemPrompt(getMalaysiaDateString());
}

export function buildBookingSystemPromptWithContext(context: string): string {
  return renderBookingSystemPrompt(getMalaysiaDateString(), context);
}

export const bookingPromptTemplate = ChatPromptTemplate.fromMessages([
  ['system', BOOKING_SYSTEM_TEMPLATE],
  ['placeholder', '{chat_history}'],
]);
