"use client";

import type { ReservationResponse } from "@reservation-platform/sdk";
import { useActionState } from "react";
import {
  rescheduleAppointmentAction,
  transitionAppointmentStatusAction,
  type AppointmentActionState,
} from "../../app/reservations/actions";
import {
  allowedAppointmentTransitions,
  statusLabel,
  transitionReasonRequired,
} from "../../lib/appointment-view";

const initialState: AppointmentActionState = { status: "idle", message: "" };

export function AppointmentStatusActions({ reservation }: { reservation: ReservationResponse }) {
  const transitions = allowedAppointmentTransitions(reservation.status);
  const terminal = transitions.length === 0;
  return <aside className="appointment-actions">
    <section>
      <span className="eyebrow">Lifecycle</span>
      <h2>{terminal ? `${statusLabel(reservation.status)} appointment` : "Update appointment status"}</h2>
      <p>{terminal ? "This is a terminal state. No further lifecycle changes are available." : "Every status change is checked against the latest appointment and recorded with its source and reason."}</p>
      {transitions.map((next) => <StatusTransitionForm key={next} reservation={reservation} next={next} />)}
    </section>
    {!terminal ? <RescheduleForm reservation={reservation} /> : null}
  </aside>;
}

function StatusTransitionForm({ reservation, next }: { reservation: ReservationResponse; next: string }) {
  const [state, action, pending] = useActionState(transitionAppointmentStatusAction, initialState);
  const requiresReason = transitionReasonRequired(next);
  return <form action={action} className="appointment-transition-form">
    <input type="hidden" name="reservation_id" value={reservation.reservation_id} />
    <input type="hidden" name="expected_status" value={reservation.status} />
    <input type="hidden" name="target_status" value={next} />
    <label>{requiresReason ? "Audit reason" : "Operational note (optional)"}<textarea name="reason" rows={2} required={requiresReason} placeholder={requiresReason ? `Why is this appointment ${statusLabel(next).toLocaleLowerCase()}?` : "Add context for the audit trail"} /></label>
    <button className={next === "cancelled" ? "danger-action" : "secondary-action"} type="submit" disabled={pending}>{pending ? "Saving…" : statusActionLabel(next)}</button>
    <ActionMessage state={state} />
  </form>;
}

function RescheduleForm({ reservation }: { reservation: ReservationResponse }) {
  const [state, action, pending] = useActionState(rescheduleAppointmentAction, initialState);
  return <section className="appointment-reschedule-panel">
    <h2>Reschedule</h2>
    <p>The current practitioner remains assigned. Conflicts and stale changes are shown without losing the appointment.</p>
    <form action={action} className="studio-form">
      <input type="hidden" name="reservation_id" value={reservation.reservation_id} />
      <input type="hidden" name="expected_status" value={reservation.status} />
      <div className="form-columns"><label>Date<input type="date" name="date" defaultValue={reservation.date ?? ""} required /></label><label>Start time<input type="time" name="start_time" defaultValue={reservation.start_time?.slice(0, 5) ?? ""} required /></label></div>
      <label>End time<input type="time" name="end_time" defaultValue={reservation.end_time?.slice(0, 5) ?? ""} required /></label>
      <label>Audit reason<textarea name="reason" rows={2} required placeholder="Why is the appointment moving?" /></label>
      <button className="primary-action" type="submit" disabled={pending}>{pending ? "Rescheduling…" : "Reschedule appointment"}</button>
      <ActionMessage state={state} />
    </form>
  </section>;
}

function ActionMessage({ state }: { state: AppointmentActionState }) {
  return state.status === "idle" ? null : <p className={`form-message ${state.status}`}>{state.message}</p>;
}

function statusActionLabel(status: string) {
  if (status === "confirmed") return "Confirm appointment";
  if (status === "completed") return "Mark completed";
  if (status === "no_show") return "Mark no-show";
  return "Cancel appointment";
}
