"use client";

import { useActionState, useMemo, useState } from "react";
import type { ExperienceOperatingHoursResponse } from "@reservation-platform/sdk";
import { saveOperatingHoursAction, type StudioActionState } from "../../app/studio/actions";
import { createAvailabilityPreviewSlots } from "../../lib/availability-preview";

const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const initialState: StudioActionState = { status: "idle", message: "" };

export function AvailabilityEditor({ value }: { value: ExperienceOperatingHoursResponse }) {
  const [state, action, pending] = useActionState(saveOperatingHoursAction, initialState);
  const [sampleDay, setSampleDay] = useState(1);
  const [slotInterval, setSlotInterval] = useState(value.slot_interval_minutes);
  const intervalsByDay = useMemo(() => days.map((_, dayOfWeek) => (
    value.intervals.filter((interval) => interval.day_of_week === dayOfWeek).slice(0, 2)
  )), [value.intervals]);
  const preview = useMemo(() => createAvailabilityPreviewSlots(
    intervalsByDay[sampleDay] ?? [],
    slotInterval,
    60,
  ), [intervalsByDay, sampleDay, slotInterval]);

  return <form action={action} className="studio-form availability-editor">
    <div className="form-columns">
      <label>Timezone<input name="timezone" defaultValue={value.timezone} required /></label>
      <label>Booking horizon (days)<input name="booking_horizon_days" type="number" min="1" max="365" defaultValue={value.booking_horizon_days} required /></label>
      <label>Slot interval (minutes)<input name="slot_interval_minutes" type="number" min="5" max="720" value={slotInterval} onChange={(event) => setSlotInterval(Number(event.target.value))} required /></label>
      <label>Minimum notice (minutes)<input name="minimum_notice_minutes" type="number" min="0" max="10080" defaultValue={value.minimum_notice_minutes} required /></label>
    </div>

    <div className="weekly-schedule" aria-label="Weekly operating schedule">
      {days.map((day, dayOfWeek) => <fieldset key={day} className="schedule-day">
        <legend>{day}</legend>
        {[0, 1].map((intervalIndex) => {
          const interval = intervalsByDay[dayOfWeek]?.[intervalIndex];
          return <div className="schedule-interval" key={intervalIndex}>
            <span>{intervalIndex === 0 ? "Primary" : "Optional second"}</span>
            <label>Opens<input name={`day_${dayOfWeek}_start_${intervalIndex}`} type="time" defaultValue={interval?.start_time ?? ""} /></label>
            <label>Closes<input name={`day_${dayOfWeek}_end_${intervalIndex}`} type="time" defaultValue={interval?.end_time ?? ""} /></label>
          </div>;
        })}
      </fieldset>)}
    </div>

    <label>Date closures
      <textarea name="closures" rows={5} defaultValue={value.closures.map((closure) => `${closure.date}${closure.reason ? ` | ${closure.reason}` : ""}`).join("\n")} placeholder="2026-08-31 | Public holiday" />
      <small className="field-hint">One date per line. Add an optional reason after a vertical bar.</small>
    </label>

    <section className="slot-preview" aria-label="Sample day slot preview">
      <div>
        <h3>Sample-day preview</h3>
        <p>Uses a 60-minute sample service duration and the selected slot interval.</p>
      </div>
      <label>Day<select value={sampleDay} onChange={(event) => setSampleDay(Number(event.target.value))}>
        {days.map((day, index) => <option value={index} key={day}>{day}</option>)}
      </select></label>
      <div className="slot-chip-list">
        {preview.length > 0 ? preview.map((slot) => <span className="slot-chip" key={slot}>{slot}</span>) : <span className="muted">Closed or no complete 60-minute slot.</span>}
      </div>
    </section>

    <div className="form-footer">
      <p className={`form-message ${state.status}`} aria-live="polite">{state.message}</p>
      <button className="primary-action" type="submit" disabled={pending}>{pending ? "Saving…" : "Save operating hours"}</button>
    </div>
  </form>;
}
