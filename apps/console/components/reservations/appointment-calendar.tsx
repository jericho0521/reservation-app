import type { ReservationResponse, ServiceResponse } from "@reservation-platform/sdk";
import React from "react";
import { nextAppointmentDate, statusLabel } from "../../lib/appointment-view";
import { reservationChannel } from "../../lib/reservation-operations";

export function AppointmentCalendar({
  appointments,
  date,
  timezone,
  practitioners,
  services,
}: {
  appointments: ReservationResponse[];
  date: string;
  timezone: string;
  practitioners: Array<{ id: string; label: string }>;
  services: ServiceResponse[];
}) {
  const practitionerNames = new Map(practitioners.map((practitioner) => [practitioner.id, practitioner.label]));
  const servicesById = new Map(services.map((service) => [service.service_id, service]));
  return (
    <section className="appointment-calendar" aria-labelledby="appointment-calendar-heading">
      <header>
        <div><span className="eyebrow">Daily schedule</span><h2 id="appointment-calendar-heading">{displayDate(date)}</h2><p>Times shown in {timezone}.</p></div>
        <nav aria-label="Schedule date">
          <a href={`/admin/reservations?date=${nextAppointmentDate(date, -1)}`}>← Previous day</a>
          <a href={`/admin/reservations?date=${nextAppointmentDate(date, 1)}`}>Next day →</a>
        </nav>
      </header>
      {appointments.length === 0 ? <div className="overview-empty"><strong>No reservations for this view</strong><p>Choose another date or adjust the location, service, and status filters.</p></div> : <ol className="appointment-day-list">
        {appointments.map((appointment) => {
          const service = servicesById.get(appointment.service_id);
          const appointmentMode = service?.booking_mode === "appointment" || Boolean(appointment.staff_id);
          return <li key={appointment.reservation_id}>
          <time dateTime={`${appointment.date ?? date}T${appointment.start_time ?? "00:00"}`}>{shortTime(appointment.start_time)}<span>{shortTime(appointment.end_time)}</span></time>
          <div className="appointment-day-card">
            <div><strong>{String(appointment.metadata?.service_name ?? service?.name ?? "Reservation")}</strong><span>{appointment.customer?.name ?? "Guest"}{appointmentMode ? `, ${practitionerNames.get(appointment.staff_id ?? "") ?? "Any available practitioner"}` : `, ${appointment.quantity} seat${appointment.quantity === 1 ? "" : "s"}`}</span></div>
            <div><span className={`reservation-state is-${appointment.status}`}>{statusLabel(appointment.status)}</span><small>{reservationChannel(appointment)}</small></div>
            <a href={`/admin/reservations/${encodeURIComponent(appointment.reservation_id)}`}>Operate →</a>
          </div>
        </li>;
        })}
      </ol>}
    </section>
  );
}

function shortTime(value?: string) { return value?.slice(0, 5) || "Not set"; }

function displayDate(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleDateString("en-MY", { dateStyle: "full", timeZone: "UTC" });
}
