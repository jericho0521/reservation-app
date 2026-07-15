"use client";

import { useActionState } from "react";
import type { EmailIntegrationSettingsResponse } from "@reservation-platform/sdk";
import {
  saveEmailSettingsAction,
  testEmailConnectionAction,
  type EmailSettingsActionState,
} from "../../app/settings/email/actions";

const initialState: EmailSettingsActionState = { status: "idle" };

export function EmailSettingsForm({ value }: { value: EmailIntegrationSettingsResponse }) {
  const [saveState, saveAction, saving] = useActionState(saveEmailSettingsAction, initialState);
  const [testState, testAction, testing] = useActionState(testEmailConnectionAction, initialState);

  return <div className="page-stack">
    <form action={saveAction} className="panel studio-form">
      <label className="channel-option">
        <span><strong>Enable appointment email delivery</strong><small>Workers can send confirmations and reminders after the SMTP connection is configured.</small></span>
        <span className={`readiness-state ${value.enabled && value.configured ? "ready" : "degraded"}`}>{value.enabled ? "enabled" : "disabled"}</span>
        <input type="checkbox" name="enabled" defaultChecked={value.enabled} />
      </label>
      <div className="form-columns">
        <label>SMTP host<input name="host" required maxLength={253} defaultValue={value.host ?? ""} placeholder="smtp.example.com" /></label>
        <label>SMTP port<input name="port" required type="number" min="1" max="65535" defaultValue={value.port ?? 587} /></label>
      </div>
      <label>From name<input name="from_name" maxLength={120} defaultValue={value.from_name ?? ""} placeholder="Your business name" /></label>
      <div className="form-columns">
        <label>Transport security<select name="tls_mode" defaultValue={value.tls_mode ?? "starttls"}><option value="starttls">STARTTLS</option><option value="required">TLS from connection</option><option value="plain">None</option></select></label>
        <label>From address<input name="from_address" required type="email" maxLength={320} defaultValue={value.from_address ?? ""} placeholder="bookings@example.com" /></label>
      </div>
      <fieldset>
        <legend>SMTP authentication</legend>
        <p className="field-hint">{value.credential_present ? "Credentials are stored securely. Leave both fields blank to keep the current credentials." : "Enter both fields if your SMTP server requires authentication."}</p>
        <div className="form-columns">
          <label>Username<input name="username" autoComplete="off" maxLength={320} /></label>
          <label>Password<input name="password" type="password" autoComplete="new-password" maxLength={1024} /></label>
        </div>
      </fieldset>
      <div className="form-footer">
        <p className={`form-message ${saveState.status}`} aria-live="polite">{saveState.message}</p>
        <button className="primary-action" disabled={saving}>{saving ? "Saving…" : "Save email settings"}</button>
      </div>
    </form>
    <form action={testAction} className="panel setup-summary">
      <span className={`status-pill ${value.configured ? "ready" : "degraded"}`}>{value.configured ? "Configuration saved" : "Not configured"}</span>
      <h2>Send a test email</h2>
      <p>Sends one message to your owner email address with a short timeout, without displaying provider error details or stored secrets.</p>
      <p className={`form-message ${testState.status}`} aria-live="polite">{testState.message}</p>
      <button className="secondary-action" disabled={!value.configured || testing}>{testing ? "Sending…" : "Send test email"}</button>
    </form>
  </div>;
}
