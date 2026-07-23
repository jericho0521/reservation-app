"use client";

import {
  createReservationPlatformClient,
  type AvailabilitySlot,
  type ReservationResponse,
} from "@reservation-platform/sdk";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  loadManagedRescheduleAvailability,
  supportsManagedReschedule,
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
  reservation: Pick<ReservationResponse, "service_id" | "staff_id" | "quantity" | "date" | "start_at" | "reservation_items">;
}) {
  const router = useRouter();
  const client = useMemo(() => createReservationPlatformClient({ baseUrl }), [baseUrl]);
  const [date, setDate] = useState(reservation.date ?? reservation.start_at?.slice(0, 10) ?? "");
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [selectedStart, setSelectedStart] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [rescheduleMode, setRescheduleMode] = useState<"checking" | "supported" | "unsupported" | "error">(
    reservation.staff_id ? "supported" : "checking",
  );
  const [notice, setNotice] = useState<{ kind: "error" | "success"; message: string }>();

  async function refreshAvailability(nextDate: string) {
    if (!nextDate) {
      setSlots([]);
      return;
    }
    if (!reservation.staff_id) setRescheduleMode("checking");
    setNotice(undefined);
    setLoading(true);
    try {
      const availability = await loadManagedRescheduleAvailability(client, slug, token, reservation, nextDate);
      const supported = supportsManagedReschedule({
        ...(reservation.staff_id ? { staffId: reservation.staff_id } : {}),
        ...(availability.resourceStrategy ? { resourceStrategy: availability.resourceStrategy } : {}),
        ...(reservation.reservation_items ? { reservationItems: reservation.reservation_items } : {}),
        ...(availability.resources ? { resources: availability.resources } : {}),
      });
      setRescheduleMode(supported ? "supported" : "unsupported");
      setSlots(supported ? availability.slots : []);
    } catch {
      setSlots([]);
      setNotice({ kind: "error", message: "Available times could not be loaded. Please try again." });
      if (!reservation.staff_id) setRescheduleMode("error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setSelectedStart("");
    setNotice(undefined);
    void refreshAvailability(date);
  }, [client, date, reservation.service_id, reservation.staff_id, reservation.reservation_items, slug, token]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedStart) return;
    setSubmitting(true);
    setNotice(undefined);
    try {
      const result = await submitManagedReschedule(client, slug, token, {
        date,
        start_time: selectedStart,
        ...(reservation.staff_id ? { staff_id: reservation.staff_id } : {}),
      });
      if (!result.updated) {
        setSelectedStart("");
        setNotice({ kind: "error", message: "That time is no longer available. Choose another time." });
        await refreshAvailability(date);
        return;
      }
      setNotice({ kind: "success", message: `Your ${reservation.staff_id ? "appointment" : "reservation"} was rescheduled.` });
      await refreshAvailability(date);
      router.refresh();
    } catch {
      setNotice({ kind: "error", message: `The ${reservation.staff_id ? "appointment" : "reservation"} could not be rescheduled. Please try again.` });
    } finally {
      setSubmitting(false);
    }
  }

  if (rescheduleMode === "checking") return <section className="manage-reschedule" aria-live="polite">
    <h2>Checking reschedule options</h2>
    <p>Confirming whether this reservation can be rescheduled online…</p>
  </section>;

  if (rescheduleMode === "error") return <section className="manage-reschedule">
    <h2>Choose a new date</h2>
    <p role="alert" className="manage-error">{notice?.message ?? "Available times could not be loaded. Please try again."}</p>
    <label>Date<input type="date" value={date} onChange={(event) => setDate(event.currentTarget.value)} required /></label>
    <button type="button" disabled={loading || !date} onClick={() => void refreshAvailability(date)}>{loading ? "Checking…" : "Try again"}</button>
  </section>;

  if (rescheduleMode === "unsupported") return <section className="manage-reschedule">
    <h2>Contact the business to reschedule</h2>
    <p>This reservation uses an assigned resource. The business must confirm another available resource before moving it.</p>
  </section>;

  return <form onSubmit={submit} className="manage-reschedule">
    <h2>Choose a new time</h2>
    <p>{reservation.staff_id ? "Only currently available times for your practitioner can be selected." : "Only times with enough remaining capacity are shown."}</p>
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
    <button type="submit" disabled={!selectedStart || submitting}>{submitting ? "Rescheduling…" : `Reschedule ${reservation.staff_id ? "appointment" : "reservation"}`}</button>
  </form>;
}
