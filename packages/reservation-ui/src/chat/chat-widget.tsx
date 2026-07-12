import type { FormEvent } from "react";
import type { ConversationBookingProposalResponse, ConversationMessageResponse, ReservationResponse } from "@reservation-platform/contract-types";

export interface ChatWidgetProps {
  brandName: string;
  messages: ConversationMessageResponse[];
  proposal?: ConversationBookingProposalResponse;
  reservation?: ReservationResponse;
  draft: string;
  loading?: boolean;
  restoring?: boolean;
  error?: string;
  canRetry?: boolean;
  handoff?: boolean;
  onDraftChange(value: string): void;
  onSend(content: string): void;
  onConfirm(): void;
  onRetry(): void;
}

export function ChatWidget(props: ChatWidgetProps) {
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const content = props.draft.trim();
    if (content && !props.loading) props.onSend(content);
  };
  return <section className="rp-chat" aria-label={`${props.brandName} booking assistant`}>
    <header className="rp-chat-header">
      <div><span>Booking assistant</span><h1>Chat with {props.brandName}</h1></div>
      <span className={`rp-chat-status ${props.handoff ? "is-handoff" : ""}`}>{props.handoff ? "Staff joined" : "AI available"}</span>
    </header>
    <div className="rp-chat-timeline" role="log" aria-live="polite" aria-busy={props.loading || props.restoring}>
      {props.restoring ? <p className="rp-chat-notice">Restoring your conversation…</p> : null}
      {!props.restoring && props.messages.length === 0 ? <div className="rp-chat-welcome"><strong>What would you like to reserve?</strong><p>Ask about services, availability, or booking policies.</p></div> : null}
      {props.messages.map((message) => <article key={message.message_id} className={`rp-chat-message is-${message.sender_type}`}>
        <span>{message.sender_type === "customer" ? "You" : message.sender_type === "staff" ? "Staff" : props.brandName}</span>
        <p>{message.content}</p>
      </article>)}
      {props.loading ? <p className="rp-chat-notice">Assistant is checking…</p> : null}
      {props.handoff ? <p className="rp-chat-handoff">A staff member is handling this conversation. Automated replies are paused.</p> : null}
    </div>
    {props.proposal && !props.reservation ? <aside className="rp-chat-proposal" aria-label="Booking proposal">
      <span>Ready for confirmation</span>
      <h2>{props.proposal.service_name}</h2>
      <dl><div><dt>Date</dt><dd>{props.proposal.date}</dd></div><div><dt>Time</dt><dd>{props.proposal.start_time}–{props.proposal.end_time}</dd></div><div><dt>Quantity</dt><dd>{props.proposal.quantity}</dd></div></dl>
      <button type="button" disabled={props.loading || props.handoff} onClick={props.onConfirm}>Confirm booking</button>
      <small>No reservation is created until you press confirm.</small>
    </aside> : null}
    {props.reservation ? <aside className="rp-chat-confirmed"><strong>Booking confirmed</strong><span>Reference {props.reservation.reservation_id}</span></aside> : null}
    {props.error ? <div className="rp-chat-error" role="alert"><span>{props.error}</span>{props.canRetry ? <button type="button" onClick={props.onRetry}>Retry</button> : null}</div> : null}
    <form className="rp-chat-composer" onSubmit={submit}>
      <label htmlFor="rp-chat-message">Message</label>
      <div><input id="rp-chat-message" value={props.draft} disabled={props.loading || props.handoff} onChange={(event) => props.onDraftChange(event.currentTarget.value)} placeholder={props.handoff ? "Waiting for staff" : "Ask about a booking…"} /><button type="submit" disabled={!props.draft.trim() || props.loading || props.handoff}>Send</button></div>
    </form>
  </section>;
}
