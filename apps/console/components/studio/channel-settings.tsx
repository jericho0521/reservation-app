"use client";

import { useActionState } from "react";
import type { ExperienceChannelSettingsResponse } from "@reservation-platform/sdk";
import { saveChannelSettingsAction, type StudioActionState } from "../../app/studio/actions";

const initialState: StudioActionState = { status: "idle", message: "" };

export function ChannelSettings({ value }: { value: ExperienceChannelSettingsResponse }) {
  const [state, action, pending] = useActionState(saveChannelSettingsAction, initialState);
  return <form action={action} className="studio-form channel-settings">
    {(["web_booking", "web_chat", "whatsapp"] as const).map((channel) => {
      const readiness = value.readiness[channel];
      return <label className="channel-option" key={channel}>
        <span>
          <strong>{channelLabel(channel)}</strong>
          <small>{readiness.message ?? (readiness.ready ? "Runtime checks passed." : "Setup is incomplete.")}</small>
        </span>
        <span className={`readiness-state ${readiness.state}`}>{readiness.state.replace("_", " ")}</span>
        <input type="checkbox" name={channel} defaultChecked={value.channels[channel]} />
      </label>;
    })}
    <div className="form-footer">
      <p className={`form-message ${state.status}`} aria-live="polite">{state.message}</p>
      <button className="primary-action" disabled={pending}>{pending ? "Saving…" : "Save channels"}</button>
    </div>
  </form>;
}

function channelLabel(value: "web_booking" | "web_chat" | "whatsapp") {
  return value === "web_booking" ? "Web booking" : value === "web_chat" ? "Web AI chat" : "WhatsApp";
}
