import type { ConversationMessageResponse, ConversationResponse } from "@reservation-platform/sdk";
import { conversationChannelLabel, deliveryStatePresentation, groupConversationTimeline } from "../../lib/conversation-view";

export function ConversationThread({ conversation, messages }: { conversation: ConversationResponse; messages: ConversationMessageResponse[] }) {
  return <section className="conversation-thread-panel">
    <header><div><span className="eyebrow">{conversationChannelLabel(conversation.channel)}</span><h1>{conversation.participant?.display_name ?? conversation.participant?.contact_hint ?? "Customer conversation"}</h1></div>{conversation.reservation_id ? <a className="secondary-action" href={`/admin/reservations/${encodeURIComponent(conversation.reservation_id)}`}>View reservation</a> : null}</header>
    <div className="owner-thread" role="log">
      {messages.length === 0 ? <p className="muted">No messages in this conversation.</p> : groupConversationTimeline(messages).map((group) => <section key={group.date}><time>{group.date}</time>{group.messages.map((message) => <article key={message.message_id} className={`owner-message is-${message.sender_type}`}><span>{senderLabel(message)}</span><p>{message.content || systemLabel(message)}</p>{message.sources?.length ? <small>Sources: {message.sources.map((source) => source.label).join(", ")}</small> : null}<DeliveryState message={message} /></article>)}</section>)}
    </div>
  </section>;
}

function senderLabel(message: ConversationMessageResponse) { return message.sender_type === "customer" ? "Customer" : message.sender_type === "staff" ? "Staff" : message.sender_type === "automation" ? "AI assistant" : "System"; }
function systemLabel(message: ConversationMessageResponse) { return message.sender_type === "system" ? "Conversation state updated" : "No text content"; }
function DeliveryState({ message }: { message: ConversationMessageResponse }) {
  if (message.direction === "inbound") return <small className="delivery-state is-delivered">Received</small>;
  const state = deliveryStatePresentation(message.delivery_state);
  return <small className={`delivery-state is-${state.tone}`} title={state.detail}>{state.label}</small>;
}
