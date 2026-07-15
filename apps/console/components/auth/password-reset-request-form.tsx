"use client";

import { useState, type FormEvent } from "react";

export function PasswordResetRequestForm() {
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    try {
      await fetch("/v1/auth/password-reset", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.get("email") }),
      });
    } finally {
      setAccepted(true);
      setSubmitting(false);
    }
  }

  if (accepted) return <div className="setup-summary"><h2>Check your reset channel</h2><p>If the account exists, a one-time reset request has been accepted. The same message is shown for every email address.</p><a href="/admin/login">Return to sign in</a></div>;
  return <form className="studio-form" onSubmit={submit}><label>Email address<input name="email" type="email" autoComplete="email" maxLength={320} required /></label><button className="primary-action auth-submit" disabled={submitting}>{submitting ? "Submitting…" : "Request password reset"}</button></form>;
}
