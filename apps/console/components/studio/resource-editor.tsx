"use client";

import { useActionState, useState } from "react";
import type { ResourceResponse, ServiceResponse } from "@reservation-platform/sdk";
import { archiveResourceAction, saveResourceAction, type StudioActionState } from "../../app/studio/actions";
import { FormFooter } from "./profile-form";

const initialState: StudioActionState = { status: "idle" };

export function ResourceEditor({ resource, services }: { resource?: ResourceResponse; services: ServiceResponse[] }) {
  const [state, action, pending] = useActionState(saveResourceAction, initialState);
  const [dirty, setDirty] = useState(!resource);
  const archived = resource?.is_active === false;
  return (
    <article className={`catalog-editor${archived ? " archived" : ""}`}>
      <div className="catalog-editor-heading"><div><span className="eyebrow">{resource ? "Resource" : "New resource"}</span><h2>{resource?.label ?? "Add an assignable resource"}</h2></div>{archived ? <span className="status-pill">Archived</span> : null}</div>
      <form action={action} className="studio-form" onInput={() => setDirty(true)}>
        <input name="resource_id" type="hidden" value={resource?.resource_id ?? ""} />
        <label>Service<select defaultValue={resource?.service_id ?? services[0]?.service_id} name="service_id" required>{services.filter((service) => service.is_active !== false).map((service) => <option key={service.service_id} value={service.service_id}>{service.name}</option>)}</select></label>
        <div className="form-columns"><label>Label<input defaultValue={resource?.label ?? ""} name="label" required /></label><label>Capacity<input defaultValue={resource?.capacity ?? 1} min={1} name="capacity" required type="number" /></label></div>
        <label>Kind<select defaultValue={resource?.kind ?? "custom"} name="kind"><option value="station">Station</option><option value="room">Room</option><option value="seat">Seat</option><option value="court">Court</option><option value="screening">Screening</option><option value="capacity_bucket">Capacity bucket</option><option value="custom">Custom</option></select></label>
        <FormFooter dirty={dirty} message={state.message} pending={pending} status={state.status} />
      </form>
      {resource && !archived ? <form action={archiveResourceAction} className="archive-form"><input name="resource_id" type="hidden" value={resource.resource_id} /><button type="submit">Archive resource</button></form> : null}
    </article>
  );
}
