import type { ConversationChannel, ConversationMessageResponse, ConversationResponse } from "@reservation-platform/sdk";

export function conversationChannelLabel(channel: ConversationChannel) {
  return channel === "web_chat" ? "Web chat" : channel === "whatsapp" ? "WhatsApp" : "Simulation";
}

export function conversationPreview(conversation: ConversationResponse) {
  return conversation.participant?.display_name
    ?? conversation.participant?.contact_hint
    ?? `${conversationChannelLabel(conversation.channel)} customer`;
}

export function groupConversationTimeline(messages: ConversationMessageResponse[]) {
  return messages.reduce<Array<{ date: string; messages: ConversationMessageResponse[] }>>((groups, message) => {
    const date = message.created_at.slice(0, 10) || "Unknown date";
    const group = groups.at(-1);
    if (group?.date === date) group.messages.push(message);
    else groups.push({ date, messages: [message] });
    return groups;
  }, []);
}
