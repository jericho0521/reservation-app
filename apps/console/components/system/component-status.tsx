import type { SystemComponentStatus } from "@reservation-platform/sdk";

export function ComponentStatus({ name, value }: { name: string; value: SystemComponentStatus }) {
  return <article className="panel system-component"><header><h2>{name}</h2><span className={`status-pill ${value.status === "healthy" ? "ready" : "degraded"}`}>{value.status}</span></header><p>{value.action}</p>{value.last_success_at ? <small>Last successful: <time dateTime={value.last_success_at}>{new Date(value.last_success_at).toLocaleString()}</time></small> : <small>No successful check recorded.</small>}</article>;
}
