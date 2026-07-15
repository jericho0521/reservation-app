"use client";

import type { ServiceResponse } from "@reservation-platform/sdk";
import { useActionState } from "react";
import { createStaffAppointmentAction, type AppointmentActionState } from "../../app/reservations/actions";

const initialState: AppointmentActionState = { status: "idle", message: "" };

export function StaffAppointmentCreate({
  date,
  services,
  practitioners,
}: {
  date: string;
  services: ServiceResponse[];
  practitioners: Array<{ id: string; label: string; serviceId?: string }>;
}) {
  const [state, action, pending] = useActionState(createStaffAppointmentAction, initialState);
  return <section className="panel">
    <span className="eyebrow">Staff booking</span>
    <h2>Create an appointment</h2>
    <p>This uses the same atomic availability, practitioner, maintenance, and conflict checks as customer bookings.</p>
    <form action={action} className="studio-form">
      <div className="form-columns"><label>Service<select name="service_id" required defaultValue=""><option value="" disabled>Choose a service</option>{services.map((service) => <option key={service.service_id} value={service.service_id}>{service.name}</option>)}</select></label><label>Practitioner<select name="staff_id" required defaultValue=""><option value="" disabled>Choose a practitioner</option>{practitioners.map((practitioner) => <option key={`${practitioner.id}:${practitioner.serviceId ?? "all"}`} value={practitioner.id}>{practitioner.label}{practitioner.serviceId ? ` — ${services.find((service) => service.service_id === practitioner.serviceId)?.name ?? "Service"}` : ""}</option>)}</select></label></div>
      <div className="form-columns"><label>Date<input type="date" name="date" defaultValue={date} required /></label><label>Start time<input type="time" name="start_time" required /></label></div>
      <div className="form-columns"><label>Customer name<input name="customer_name" required /></label><label>Customer email<input name="customer_email" type="email" required /></label></div>
      <label>Customer phone (optional)<input name="customer_phone" type="tel" /></label>
      <button className="primary-action" type="submit" disabled={pending || services.length === 0 || practitioners.length === 0}>{pending ? "Creating…" : "Create appointment"}</button>
      {state.status === "idle" ? null : <p className={`form-message ${state.status}`}>{state.message}</p>}
    </form>
  </section>;
}
