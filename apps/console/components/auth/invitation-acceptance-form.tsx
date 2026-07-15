"use client";

import { useEffect, useState, type FormEvent } from "react";

export function InvitationAcceptanceForm({ token }: { token: string }) {
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    window.history.replaceState(null, "", "/admin/invite");
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(undefined);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/v1/auth/staff/invitations/${encodeURIComponent(token)}/accept`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: form.get("display_name"), password: form.get("password") }),
      });
      if (!response.ok) {
        setError(response.status === 400 ? "This invitation is invalid or has expired." : "Invitation acceptance is temporarily unavailable.");
        return;
      }
      window.location.replace("/admin");
    } catch {
      setError("Invitation acceptance is temporarily unavailable.");
    } finally {
      setSubmitting(false);
    }
  }

  return <form className="studio-form" onSubmit={submit}>
    <label>Your name<input name="display_name" autoComplete="name" maxLength={120} required /></label>
    <label>Create a password<input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /><span className="field-hint">Use at least 12 characters.</span></label>
    {error ? <p className="form-message error" role="alert">{error}</p> : null}
    <button className="primary-action auth-submit" disabled={submitting} type="submit">{submitting ? "Activating account…" : "Accept invitation"}</button>
  </form>;
}
