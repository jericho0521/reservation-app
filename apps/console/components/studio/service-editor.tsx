"use client";

import { useActionState, useState } from "react";
import type { ServiceResponse } from "@reservation-platform/sdk";
import { archiveServiceAction, saveServiceAction, type StudioActionState } from "../../app/studio/actions";
import { FormFooter } from "./profile-form";

const initialState: StudioActionState = { status: "idle" };

export function ServiceEditor({ service }: { service?: ServiceResponse }) {
  const [state, action, pending] = useActionState(saveServiceAction, initialState);
  const [dirty, setDirty] = useState(!service);
  const archived = service?.is_active === false;
  const duration = service?.duration_minutes ?? Number(service?.metadata?.duration_minutes ?? 60);

  return (
    <article className={`catalog-editor${archived ? " archived" : ""}`}>
      <div className="catalog-editor-heading"><div><span className="eyebrow">{service ? "Service" : "New service"}</span><h2>{service?.name ?? "Add a reservable service"}</h2></div>{archived ? <span className="status-pill">Archived</span> : null}</div>
      <form action={action} className="studio-form" onInput={() => setDirty(true)}>
        <input name="service_id" type="hidden" value={service?.service_id ?? ""} />
        <label>Name<input defaultValue={service?.name ?? ""} name="name" required /></label>
        <label>Description<textarea defaultValue={service?.description ?? ""} name="description" rows={3} /></label>
        <div className="form-columns"><label>Duration in minutes<input defaultValue={duration} min={1} name="duration_minutes" required type="number" /></label><label>Total capacity<input defaultValue={service?.total_quantity ?? 1} min={1} name="total_quantity" required type="number" /></label></div>
        <div className="form-columns"><label>Resource kind<select defaultValue={service?.resource_kind ?? "capacity_bucket"} name="resource_kind"><option value="capacity_bucket">Shared capacity</option><option value="station">Station</option><option value="room">Room</option><option value="seat">Seat</option><option value="court">Court</option><option value="screening">Screening</option><option value="custom">Custom</option></select></label><label>Assignment strategy<select defaultValue={service?.resource_strategy ?? "quantity"} name="resource_strategy"><option value="quantity">Quantity</option><option value="assigned_resource">Assigned resource</option><option value="hybrid">Hybrid</option></select></label></div>
        <FormFooter dirty={dirty} message={state.message} pending={pending} status={state.status} />
      </form>
      {service && !archived ? <form action={archiveServiceAction} className="archive-form"><input name="service_id" type="hidden" value={service.service_id} /><input name="reason" type="hidden" value="Archived in Experience Studio" /><button type="submit">Archive service</button></form> : null}
    </article>
  );
}
