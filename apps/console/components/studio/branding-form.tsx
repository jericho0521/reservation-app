"use client";

import { useActionState, useEffect, useState } from "react";
import type { ExperienceBranding, ExperienceTerminology } from "@reservation-platform/sdk";
import { saveBrandingAction, type StudioActionState } from "../../app/studio/actions";
import { FormFooter } from "./profile-form";

const initialState: StudioActionState = { status: "idle" };

export function BrandingForm({ branding, terminology }: {
  branding: ExperienceBranding;
  terminology: ExperienceTerminology;
}) {
  const [state, action, pending] = useActionState(saveBrandingAction, initialState);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => { if (state.status === "success") setDirty(false); }, [state.status]);

  return (
    <form action={action} className="studio-form" onInput={() => setDirty(true)}>
      <label>Brand name<input defaultValue={branding.brand_name} name="brand_name" required /></label>
      <div className="form-columns">
        <label>Primary color<input defaultValue={branding.primary_color ?? "#2563eb"} name="primary_color" pattern="#[0-9a-fA-F]{6}" /></label>
        <label>Secondary color<input defaultValue={branding.secondary_color ?? ""} name="secondary_color" pattern="#[0-9a-fA-F]{6}" placeholder="#111827" /></label>
      </div>
      <label>Logo URL<input defaultValue={branding.logo_url ?? ""} name="logo_url" type="url" /></label>
      <label>Description<textarea defaultValue={branding.description ?? ""} name="description" rows={4} /></label>
      <fieldset><legend>Customer-facing terminology</legend><div className="form-columns three"><label>Customer<input defaultValue={terminology.customer} name="customer" required /></label><label>Resource<input defaultValue={terminology.resource} name="resource" required /></label><label>Booking<input defaultValue={terminology.booking} name="booking" required /></label></div></fieldset>
      <FormFooter dirty={dirty} message={state.message} pending={pending} status={state.status} />
    </form>
  );
}
