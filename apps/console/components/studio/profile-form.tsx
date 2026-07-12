"use client";

import { useActionState, useEffect, useState } from "react";
import { saveProfileAction, type StudioActionState } from "../../app/studio/actions";

const initialState: StudioActionState = { status: "idle" };

export function ProfileForm({ name, publicSlug }: { name: string; publicSlug: string }) {
  const [state, action, pending] = useActionState(saveProfileAction, initialState);
  const [dirty, setDirty] = useState(false);
  useUnsavedWarning(dirty);
  useEffect(() => { if (state.status === "success") setDirty(false); }, [state.status]);

  return (
    <form action={action} className="studio-form" onInput={() => setDirty(true)}>
      <label>Business name<input defaultValue={name} maxLength={120} name="name" required /></label>
      <label>Public slug<span className="field-hint">Lowercase letters, numbers, and hyphens</span><input defaultValue={publicSlug} name="public_slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required /></label>
      <FormFooter dirty={dirty} message={state.message} pending={pending} status={state.status} />
    </form>
  );
}

export function FormFooter({ dirty, message, pending, status }: {
  dirty: boolean;
  message?: string;
  pending: boolean;
  status: StudioActionState["status"];
}) {
  return (
    <div className="form-footer">
      <span className={status === "error" ? "form-message error" : "form-message"}>{message ?? (dirty ? "Unsaved changes" : "Draft is up to date")}</span>
      <button className="primary-action" disabled={pending || !dirty} type="submit">{pending ? "Saving…" : "Save changes"}</button>
    </div>
  );
}

function useUnsavedWarning(dirty: boolean) {
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
}
