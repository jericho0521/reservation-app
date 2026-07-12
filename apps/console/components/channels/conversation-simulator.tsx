"use client";

import { useActionState } from "react";
import { simulateWhatsAppMessageAction, type SimulationActionState } from "../../app/channels/actions";

const initialState: SimulationActionState = { status: "idle", sequence: 1 };

export function ConversationSimulator({ enabled }: { enabled: boolean }) {
  const [state, action, pending] = useActionState(simulateWhatsAppMessageAction, initialState);
  return <section className="simulator-panel"><div><span className="eyebrow">Credential-free demo</span><h2>Simulate a WhatsApp customer</h2><p>This follows the same conversation and booking orchestrator without contacting WhatsApp or requiring a live session.</p></div><form action={action} className="studio-form"><input type="hidden" name="message_id" value={`console-demo-step-${state.sequence}`} /><div className="form-columns"><label>Customer name<input name="display_name" defaultValue="Demo Customer" /></label><label>Phone<input name="phone" defaultValue="+60111111111" /></label></div><label>Customer message<textarea name="text" rows={3} required defaultValue="I would like to make a booking." /></label><button className="primary-action" type="submit" disabled={!enabled || pending}>{pending ? "Sending…" : enabled ? "Send simulated message" : "Enable simulation to test"}</button></form>{state.status === "success" ? <div className="simulation-result"><span>Automation reply</span><p>{state.reply}</p>{state.conversationId ? <a href={`/conversations/${encodeURIComponent(state.conversationId)}`}>Open unified conversation →</a> : null}</div> : null}{state.status === "error" ? <p className="form-message error">{state.message}</p> : null}</section>;
}
