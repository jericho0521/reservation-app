"use client";

import { useEffect, useState, type FormEvent } from "react";

export function PasswordResetCompletionForm({ token }: { token: string }) {
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    window.history.replaceState(null, "", "/admin/reset-password");
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(undefined);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/v1/auth/password-reset/${encodeURIComponent(token)}/complete`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: form.get("password") }),
      });
      if (!response.ok) {
        setError(response.status === 400 ? "This reset link is invalid or has expired." : "Password reset is temporarily unavailable.");
        return;
      }
      window.location.replace("/admin/login");
    } catch {
      setError("Password reset is temporarily unavailable.");
    } finally {
      setSubmitting(false);
    }
  }

  return <form className="studio-form" onSubmit={submit}><label>New password<input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /><span className="field-hint">Use at least 12 characters. Existing sessions are revoked after reset.</span></label>{error ? <p className="form-message error" role="alert">{error}</p> : null}<button className="primary-action auth-submit" disabled={submitting}>{submitting ? "Resetting password…" : "Set new password"}</button></form>;
}
