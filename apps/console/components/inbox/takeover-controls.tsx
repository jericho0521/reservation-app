import type { ConversationResponse } from "@reservation-platform/sdk";
import { sendConversationStaffReplyAction, updateConversationAutomationAction } from "../../app/conversations/actions";

export function TakeoverControls({ conversation }: { conversation: ConversationResponse }) {
  const manual = conversation.automation_state === "manual";
  return <aside className="takeover-panel">
    <div><span className="eyebrow">Staff control</span><h2>{manual ? "You are in control" : "Automation is active"}</h2><p>{manual ? "AI replies are paused until automation is resumed." : "Take over before replying personally to the customer."}</p></div>
    <form action={updateConversationAutomationAction}><input type="hidden" name="conversation_id" value={conversation.conversation_id} /><input type="hidden" name="automation_state" value={manual ? "automated" : "manual"} /><button className={manual ? "secondary-action" : "primary-action"} type="submit">{manual ? "Resume AI automation" : "Take over conversation"}</button></form>
    <form className="staff-reply-form" action={sendConversationStaffReplyAction}><input type="hidden" name="conversation_id" value={conversation.conversation_id} /><label>Staff reply<textarea name="content" rows={4} required disabled={!manual} placeholder={manual ? "Write a direct reply…" : "Take over the conversation before replying"} /></label><button className="primary-action" type="submit" disabled={!manual}>Send as staff</button><small>{manual ? "This reply is delivered through the durable channel outbox." : "Take over explicitly to pause AI before sending a staff reply."}</small></form>
  </aside>;
}
