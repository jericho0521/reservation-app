"use client";

import { useActionState } from "react";
import type { InstallationLocationResponse } from "@reservation-platform/sdk";
import { inviteStaffAction, type StaffInvitationActionState } from "../../app/settings/staff/actions";

const initialState: StaffInvitationActionState = { status: "idle" };

export function StaffInvitationForm({ locations }: { locations: readonly InstallationLocationResponse[] }) {
  const [state, action, pending] = useActionState(inviteStaffAction, initialState);
  return <form action={action} className="studio-form">
    <div className="form-columns"><label>Name<input name="display_name" maxLength={120} required /></label><label>Email<input name="email" type="email" maxLength={320} required /></label></div>
    <fieldset className="assignment-options"><legend>Location access</legend>{locations.map((location) => <label key={location.location_id}><input type="checkbox" name="venue_ids" value={location.location_id} defaultChecked={locations.length === 1} />{location.name}</label>)}</fieldset>
    {state.message ? <p className={`form-message ${state.status}`} role={state.status === "error" ? "alert" : undefined}>{state.message}</p> : null}
    {state.invitationUrl ? <section className="one-time-secret" aria-label="One-time invitation link"><strong>Copy before leaving this page</strong><code>{state.invitationUrl}</code><small>Expires {state.expiresAt ? new Date(state.expiresAt).toLocaleString() : "in 24 hours"}. Transfer it privately.</small></section> : null}
    <button className="primary-action" type="submit" disabled={pending}>{pending ? "Creating invitation…" : "Create invitation"}</button>
  </form>;
}
