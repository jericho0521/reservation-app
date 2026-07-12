import type { AnalyticsResponse } from "@reservation-platform/sdk";
import { percent } from "../../lib/analytics-view";
import { conversationChannelLabel } from "../../lib/conversation-view";

export function ChannelComparison({ rows }: { rows: AnalyticsResponse["channel_performance"] }) {
  return <section className="analytics-table-panel"><header><h2>Conversational funnel by channel</h2><p>Started → proposal → confirmation request → reservation.</p></header>{rows.length === 0 ? <p className="muted panel-padding">No conversational activity.</p> : <div className="responsive-table"><table><thead><tr><th>Channel</th><th>Started</th><th>Proposals</th><th>Confirmed</th><th>Conversion</th></tr></thead><tbody>{rows.map((row) => <tr key={row.channel}><td>{conversationChannelLabel(row.channel)}</td><td>{row.conversations_started}</td><td>{row.proposal_shown}</td><td>{row.reservations_created}</td><td>{percent(row.conversion_rate)}</td></tr>)}</tbody></table></div>}</section>;
}
