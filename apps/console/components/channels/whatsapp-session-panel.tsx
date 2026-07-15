import type { WhatsAppChannelReadinessResponse, WhatsAppOwnerSessionResponse } from "@reservation-platform/sdk";
import { logoutWhatsAppSessionAction, reconnectWhatsAppSessionAction, startWhatsAppSessionAction } from "../../app/channels/actions";
import { describeWhatsAppSession } from "../../lib/channel-page-state";

export function WhatsAppSessionPanel({ readiness, session }: { readiness: WhatsAppChannelReadinessResponse; session: WhatsAppOwnerSessionResponse }) {
  const view = describeWhatsAppSession(readiness, session, false);
  return <section className={`session-controls is-${view.tone}`} data-session-state={view.state} aria-live="polite">
    <div><span className="eyebrow">WhatsApp session</span><strong>{view.title}</strong><p>{view.description}</p><small>Last updated {formatUpdatedAt(session.updated_at)}</small></div>
    {view.canStart ? <form action={startWhatsAppSessionAction}><button className="primary-action" type="submit">Start QR pairing</button></form> : null}
    {view.state === "degraded" ? <form action={reconnectWhatsAppSessionAction}><button className="primary-action" type="submit">Reconnect session</button></form> : null}
    {view.canDisconnect ? <form action={logoutWhatsAppSessionAction}><button className="secondary-action" type="submit">Disconnect session</button></form> : null}
  </section>;
}

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "unknown" : date.toLocaleString("en-MY", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kuala_Lumpur" });
}
