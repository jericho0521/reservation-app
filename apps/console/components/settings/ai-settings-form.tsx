"use client";

import { useActionState } from "react";
import type { AiIntegrationSettingsResponse } from "@reservation-platform/sdk";
import {
  revokeAiCredentialAction,
  saveAiSettingsAction,
  testAiConnectionAction,
  type AiSettingsActionState,
} from "../../app/settings/ai/actions";

const initialState: AiSettingsActionState = { status: "idle" };

export function AiSettingsForm({ value }: { value: AiIntegrationSettingsResponse }) {
  const [saveState, saveAction, saving] = useActionState(saveAiSettingsAction, initialState);
  const [testState, testAction, testing] = useActionState(testAiConnectionAction, initialState);
  const [revokeState, revokeAction, revoking] = useActionState(revokeAiCredentialAction, initialState);

  return <div className="page-stack">
    <form action={saveAction} className="panel studio-form">
      <label className="channel-option">
        <span><strong>Enable AI automation</strong><small>New automated conversation turns use the saved provider after a successful configuration.</small></span>
        <span className={`readiness-state ${value.enabled && value.credential_present ? "ready" : "degraded"}`}>{value.enabled && value.credential_present ? "Booking assistant available" : value.enabled ? "Degraded (Key required)" : "Disabled"}</span>
        <input type="checkbox" name="enabled" defaultChecked={value.enabled} />
      </label>
      <div className="form-columns">
        <label>Provider<select disabled defaultValue="openai"><option value="openai">OpenAI / OpenRouter Compatible</option></select></label>
        <label>Model<input name="model" required maxLength={200} defaultValue={value.model ?? "gpt-4.1-mini"} /></label>
      </div>
      <label>Base URL <small>Optional BYOK provider endpoint</small><input name="base_url" type="url" maxLength={2048} defaultValue={value.base_url ?? ""} placeholder="https://api.openai.com/v1" /></label>
      <label>API key<input name="api_key" type="password" autoComplete="new-password" maxLength={4096} placeholder={value.credential_present ? "Stored securely — enter a new key to rotate" : "Enter an API key"} /></label>
      <p className="field-hint">{value.credential_present ? "A credential is stored securely. Leaving this blank preserves it." : "No credential is stored yet."}</p>
      <div className="form-footer">
        <p className={`form-message ${saveState.status}`} aria-live="polite">{saveState.message}</p>
        <button className="primary-action" disabled={saving}>{saving ? "Saving…" : "Save AI settings"}</button>
      </div>
    </form>
    <div className="form-columns">
      <form action={testAction} className="panel setup-summary">
        <h2>Test provider connection</h2><p>Runs one bounded, non-sensitive test request using the stored credential.</p>
        <p className={`form-message ${testState.status}`} aria-live="polite">{testState.message}</p>
        <button className="secondary-action" disabled={!value.credential_present || testing}>{testing ? "Testing…" : "Test connection"}</button>
      </form>
      <form action={revokeAction} className="panel setup-summary">
        <h2>Revoke credential</h2><p>Deletes the stored API key immediately. Save a new key before re-enabling automation.</p>
        <p className={`form-message ${revokeState.status}`} aria-live="polite">{revokeState.message}</p>
        <button className="secondary-action" disabled={!value.credential_present || revoking}>{revoking ? "Revoking…" : "Revoke API key"}</button>
      </form>
    </div>
  </div>;
}
