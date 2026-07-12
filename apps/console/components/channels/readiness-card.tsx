import type { ChannelRuntimeStatus } from "@reservation-platform/sdk";

export function ReadinessCard({ title, status, detail }: { title: string; status: ChannelRuntimeStatus; detail?: string }) {
  return <article className="readiness-card"><header><h2>{title}</h2><span className={`health-dot ${status.healthy ? "healthy" : "attention"}`}>{status.healthy ? "Healthy" : "Attention"}</span></header><dl><State label="Configured" value={status.configured} /><State label="Connected" value={status.connected} /><State label="Healthy" value={status.healthy} /></dl><p>{status.message}</p>{detail ? <small>{detail}</small> : null}</article>;
}

function State({ label, value }: { label: string; value: boolean }) { return <div><dt>{label}</dt><dd className={value ? "is-yes" : "is-no"}>{value ? "Yes" : "No"}</dd></div>; }
