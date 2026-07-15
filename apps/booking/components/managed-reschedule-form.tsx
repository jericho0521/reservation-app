"use client";

import {
  createReservationPlatformClient,
  type AvailabilitySlot,
  type ReservationResponse,
} from "@reservation-platform/sdk";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  loadManagedRescheduleAvailability,
  submitManagedReschedule,
} from "../lib/reservation-management";

export function ManagedRescheduleForm({
  baseUrl,
  slug,
  token,
  reservation,
}: {
  baseUrl: string;
  slug: string;
  token: string;
  reservation: Pick<ReservationResponse, "service_id" | "staff_id" | "quantity" | "date" | "start_at">;
}) {
  const client = useMemo(() => createReservationPlatformClient({ baseUrl }), [baseUrl]);
  const [date, setDate] = useState(reservation.date ?? reservation.start_at?.slice(0, 10) ?? "");
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [selectedStart, setSelectedStart] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<{ kind: "error" | "success"; message: string }>();

  async function refreshAvailability(nextDate: string) {
    if (!nextDate || !reservation.staff_id) {
      setSlots([]);
      return;
    }
    setLoading(true);
    try {
      setSlots(await loadManagedRescheduleAvailability(client, slug, reservation, nextDate));
    } catch {
      setSlots([]);
      setNotice({ kind: "error", message: "Available times could not be loaded. Please try again." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setSelectedStart("");
    setNotice(undefined);
    void refreshAvailability(date);
  }, [client, date, reservation.service_id, reservation.staff_id, slug]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reservation.staff_id || !selectedStart) return;
    setSubmitting(true);
    setNotice(undefined);
    try {
      const result = await submitManagedReschedule(client, slug, token, {
        date,
        start_time: selectedStart,
        staff_id: reservation.staff_id,
      });
      if (!result.updated) {
        setSelectedStart("");
        setNotice({ kind: "error", message: "That time is no longer available. Choose another time." });
        await refreshAvailability(date);
        return;
      }
      setNotice({ kind: "success", message: "Your appointment was rescheduled." });
      await refreshAvailability(date);
    } catch {
      setNotice({ kind: "error", message: "The appointment could not be rescheduled. Please try again." });
    } finally {
      setSubmitting(false);
    }
  }

  if (!reservation.staff_id) {
    return <p className="manage-cancelled">Contact the business to change the practitioner or appointment time.</p>;
  }

  return <form onSubmit={submit} className="manage-reschedule">
    <h2>Choose a new time</h2>
    <p>Only currently available times for your practitioner can be selected.</p>
    {notice ? <p role={notice.kind === "error" ? "alert" : "status"} className={notice.kind === "error" ? "manage-error" : "manage-success"}>{notice.message}</p> : null}
    <label>Date<input type="date" value={date} onChange={(event) => setDate(event.currentTarget.value)} required /></label>
    <fieldset className="manage-slot-fieldset" disabled={loading || submitting}>
      <legend>Available start time</legend>
      {loading ? <p role="status">Checking availability…</p> : slots.length === 0 ? <p>No available times for this date.</p> : <div className="manage-slot-grid">
        {slots.map((slot) => {
          const start = slot.start_time ?? slot.start_at?.slice(11, 16) ?? "";
          return <label key={`${start}-${slot.end_time ?? slot.end_at}`} className={selectedStart === start ? "selected" : undefined}>
            <input type="radio" name="start_time" value={start} checked={selectedStart === start} onChange={() => setSelectedStart(start)} />
            {start}
          </label>;
        })}
      </div>}
    </fieldset>
    <button type="submit" disabled={!selectedStart || submitting}>{submitting ? "Rescheduling…" : "Reschedule appointment"}</button>
  </form>;
}
