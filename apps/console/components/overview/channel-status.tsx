import type { OperationsOverviewResponse } from "@reservation-platform/sdk";
import { channelLabel } from "../../lib/operations-view";

export function ChannelStatus({ readiness }: { readiness: OperationsOverviewResponse["channel_readiness"] }) {
  return <section className="overview-panel"><header><div><span className="eyebrow">Customer entry points</span><h2>Channel health</h2></div><a href="/admin/channels">Manage</a></header><ul className="channel-status-list">{Object.entries(readiness).map(([channel, status]) => <li key={channel}><div><strong>{channelLabel(channel)}</strong><span>{status.desired_enabled ? "Enabled" : "Disabled"}</span></div><span className={`readiness-state ${status.ready ? "ready" : status.configured ? "degraded" : ""}`}>{status.ready ? "Ready" : status.configured ? "Degraded" : "Not configured"}</span></li>)}</ul></section>;
}
