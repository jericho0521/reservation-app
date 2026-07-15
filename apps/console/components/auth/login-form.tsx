"use client";

import { useState, type FormEvent } from "react";

export function LoginForm() {
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setSubmitting(true);
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/v1/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
      });
      if (!response.ok) {
        setError(response.status === 401
          ? "The email or password is incorrect."
          : "Sign in is temporarily unavailable. Please try again.");
        return;
      }
      window.location.replace("/admin");
    } catch {
      setError("Sign in is temporarily unavailable. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="studio-form" onSubmit={submit}>
      <label>
        Email address
        <input autoComplete="email" inputMode="email" name="email" required type="email" />
      </label>
      <label>
        Password
        <input autoComplete="current-password" name="password" required type="password" />
      </label>
      {error ? <p className="form-message error" role="alert">{error}</p> : null}
      <button className="primary-action auth-submit" disabled={submitting} type="submit">
        {submitting ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
