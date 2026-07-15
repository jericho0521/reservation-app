"use client";

import { useActionState } from "react";
import { publishSetupAction } from "../../app/setup/actions";
import { publishExperienceAction, type StudioActionState } from "../../app/studio/actions";

const initialState: StudioActionState = { status: "idle", message: "" };

export function PublishPanel({
  configurationId,
  valid,
  draftVersion,
  publishedVersion,
  publishedAt,
  onboarding = false,
}: {
  configurationId: string;
  valid: boolean;
  draftVersion: number;
  publishedVersion?: number;
  publishedAt?: string;
  onboarding?: boolean;
}) {
  const [state, action, pending] = useActionState(onboarding ? publishSetupAction : publishExperienceAction, initialState);
  return <form action={action} className="publish-panel studio-form">
    <input type="hidden" name="configuration_id" value={configurationId} />
    <div className="version-comparison">
      <div><span>Saved draft</span><strong>Version {draftVersion}</strong></div>
      <div><span>Currently live</span><strong>{publishedVersion ? `Version ${publishedVersion}` : "Not published"}</strong><small>{publishedAt ? new Date(publishedAt).toLocaleString() : "No customer-facing version yet"}</small></div>
    </div>
    <label className="publish-confirmation">
      <input type="checkbox" name="confirm_publish" disabled={!valid} />
      <span>I understand this draft will become the customer-facing experience.</span>
    </label>
    <div className="form-footer">
      <p className={`form-message ${state.status}`} aria-live="polite">{state.message}</p>
      <button className="primary-action" disabled={pending || !valid}>{pending ? "Publishing…" : onboarding ? "Publish and open dashboard" : "Publish experience"}</button>
    </div>
  </form>;
}
