import type {
  ConversationMessageResponse,
  PublicChatConversationResponse,
} from "@reservation-platform/sdk";
import type { ReservationPlatformClient } from "@reservation-platform/sdk";

type PublicChatClient = Pick<
  ReservationPlatformClient,
  "sendPublicChatMessage" | "listPublicChatMessages" | "confirmPublicChatBooking"
>;

export interface DurablePublicChatPollingOptions {
  delaysMs?: readonly number[];
  sleep?: (milliseconds: number) => Promise<void>;
}

export function createDurablePublicChatClient(
  client: PublicChatClient,
  polling: DurablePublicChatPollingOptions = {},
): PublicChatClient {
  return {
    listPublicChatMessages: (...args) => client.listPublicChatMessages(...args),
    confirmPublicChatBooking: (...args) => client.confirmPublicChatBooking(...args),
    async sendPublicChatMessage(slug, input, options) {
      const accepted = await client.sendPublicChatMessage(slug, input, options);
      if (
        accepted.automation_suppressed
        || !accepted.message
        || accepted.message.direction === "outbound"
      ) {
        return accepted;
      }
      return pollForAssistantReply(client, slug, accepted, polling);
    },
  };
}

export async function pollForAssistantReply(
  client: Pick<ReservationPlatformClient, "listPublicChatMessages">,
  slug: string,
  accepted: PublicChatConversationResponse,
  options: DurablePublicChatPollingOptions = {},
): Promise<PublicChatConversationResponse> {
  const inbound = accepted.message;
  if (!inbound) return accepted;
  const delays = options.delaysMs ?? [150, 300, 600, 1_200, 2_000];
  const sleep = options.sleep ?? wait;

  for (const delay of delays) {
    await sleep(delay);
    const result = await client.listPublicChatMessages(
      slug,
      accepted.conversation_id,
      { limit: 100 },
    );
    const reply = firstReplyAfter(result.messages, inbound);
    if (reply) {
      return {
        ...accepted,
        message: reply,
        ...(result.proposal ? { proposal: result.proposal } : {}),
      };
    }
  }
  throw new Error("The assistant is still processing this message. Please try again.");
}

function firstReplyAfter(
  messages: ConversationMessageResponse[],
  inbound: ConversationMessageResponse,
) {
  return messages
    .filter((message) => (
      message.direction === "outbound"
      && message.conversation_id === inbound.conversation_id
      && message.created_at >= inbound.created_at
    ))
    .sort((left, right) => left.created_at.localeCompare(right.created_at))[0];
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}
