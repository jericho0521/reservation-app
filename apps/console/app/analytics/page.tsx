import { ChannelComparison } from "../../components/analytics/channel-comparison";
import { DateRangeFilter } from "../../components/analytics/date-range-filter";
import { DemandChart } from "../../components/analytics/demand-chart";
import { MetricSummary } from "../../components/analytics/metric-summary";
import { SetupError, safeSetupErrorMessage } from "../../components/setup-error";
import { analyticsDateRange } from "../../lib/analytics-view";
import { createConsolePlatformClient } from "../../lib/platform-client";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; include_simulation?: string }> }) {
  try {
    const params = await searchParams; const range = analyticsDateRange(params); const includeSimulation = params.include_simulation === "true";
    const analytics = await createConsolePlatformClient().getAnalytics({ ...range, include_simulation: includeSimulation });
    return <div className="page-stack"><header className="page-header split-header"><div><span className="eyebrow">Descriptive analytics</span><h1>Understand demand and channel performance</h1><p>Measured outcomes only—no forecasts or invented trends. Dates are bucketed in {analytics.timezone}.</p></div><span className="live-refresh">Updated {new Date(analytics.generated_at).toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" })}</span></header><DateRangeFilter range={range} includeSimulation={includeSimulation} /><MetricSummary analytics={analytics} />{analytics.totals.reservations === 0 && analytics.funnel.conversations_started === 0 ? <section className="analytics-empty"><strong>No activity in this range</strong><p>Expand the dates or include simulation traffic to inspect demo conversations.</p></section> : <><DemandChart days={analytics.reservations_by_day} /><div className="analytics-columns"><ChannelComparison rows={analytics.channel_performance} /><section className="analytics-table-panel"><header><h2>Popular slots</h2><p>Confirmed and completed reservations, excluding cancellations.</p></header>{analytics.popular_slots.length === 0 ? <p className="muted panel-padding">No booked slots.</p> : <table><thead><tr><th>Day</th><th>Start</th><th>Bookings</th></tr></thead><tbody>{analytics.popular_slots.map((slot) => <tr key={`${slot.day_of_week}:${slot.start_time}`}><td>{dayName(slot.day_of_week)}</td><td>{slot.start_time.slice(0, 5)}</td><td>{slot.count}</td></tr>)}</tbody></table>}</section></div></>}</div>;
  } catch (error) { return <SetupError message={safeSetupErrorMessage(error)} />; }
}

function dayName(value: number) { return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][value - 1] ?? String(value); }
