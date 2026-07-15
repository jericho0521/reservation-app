"use client";

import { useEffect, useState, type FormEvent } from "react";

export function SetupOwnerForm({ setupToken }: { setupToken: string }) {
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    window.history.replaceState(null, "", "/admin/setup");
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setSubmitting(true);
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/v1/setup/owner", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          setup_token: setupToken,
          email: form.get("email"),
          display_name: form.get("display_name"),
          password: form.get("password"),
        }),
      });
      if (!response.ok) {
        setError(response.status === 401 || response.status === 409
          ? "This setup link is no longer valid. Use the current link from the server."
          : "Owner setup could not be completed. Check the details and try again.");
        return;
      }
      window.location.replace("/admin");
    } catch {
      setError("Owner setup is temporarily unavailable. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="studio-form" onSubmit={submit}>
      <label>
        Your name
        <input autoComplete="name" maxLength={120} name="display_name" required />
      </label>
      <label>
        Email address
        <input autoComplete="email" inputMode="email" maxLength={320} name="email" required type="email" />
      </label>
      <label>
        Password
        <input autoComplete="new-password" maxLength={128} minLength={12} name="password" required type="password" />
        <span className="field-hint">Use at least 12 characters.</span>
      </label>
      {error ? <p className="form-message error" role="alert">{error}</p> : null}
      <button className="primary-action auth-submit" disabled={submitting} type="submit">
        {submitting ? "Creating owner…" : "Create owner account"}
      </button>
    </form>
  );
}
