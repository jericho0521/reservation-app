import type { ConversationChannel, ConversationResponse } from "@reservation-platform/sdk";
import { conversationChannelLabel, conversationPreview } from "../../lib/conversation-view";

export function ConversationList({ conversations, channel }: { conversations: ConversationResponse[]; channel?: ConversationChannel }) {
  return <section className="inbox-list-panel">
    <form className="inbox-filters" method="get">
      <label>Channel<select name="channel" defaultValue={channel ?? ""}><option value="">All channels</option><option value="web_chat">Web chat</option><option value="whatsapp">WhatsApp</option><option value="simulation">Simulation</option></select></label>
      <button type="submit">Apply</button>
    </form>
    {conversations.length === 0 ? <div className="inbox-empty"><strong>No conversations yet</strong><p>Customer web chat, WhatsApp, and simulation messages will appear here.</p></div> : <ol className="conversation-list">
      {conversations.map((conversation) => <li key={conversation.conversation_id}><a href={`/admin/conversations/${encodeURIComponent(conversation.conversation_id)}`}>
        <div><strong>{conversationPreview(conversation)}</strong><span>{conversationChannelLabel(conversation.channel)}</span></div>
        <div><span className={`automation-badge is-${conversation.automation_state}`}>{conversation.automation_state === "manual" ? "Staff takeover" : "Automated"}</span><time>{formatTime(conversation.last_message_at ?? conversation.updated_at)}</time></div>
      </a></li>)}
    </ol>}
  </section>;
}

function formatTime(value: string) { const date = new Date(value); return Number.isNaN(date.valueOf()) ? "" : date.toLocaleString("en-MY", { dateStyle: "medium", timeStyle: "short" }); }
