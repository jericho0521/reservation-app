import { SetupError, safeSetupErrorMessage } from "../components/setup-error";
import { AttentionList } from "../components/overview/attention-list";
import { ChannelStatus } from "../components/overview/channel-status";
import { MetricCard } from "../components/overview/metric-card";
import { TodayTimeline } from "../components/overview/today-timeline";
import { LiveStatus } from "../components/live-status";
import { createConsolePlatformClient } from "../lib/platform-client";
import { buildOperationsAttentionItems } from "../lib/operations-view";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  try {
    const client = createConsolePlatformClient();
    const [workspaceResult, overviewResult] = await Promise.allSettled([client.getExperienceWorkspace(), client.getOperationsOverview()]);
    if (workspaceResult.status === "rejected" && overviewResult.status === "rejected") throw overviewResult.reason;
    const workspace = workspaceResult.status === "fulfilled" ? workspaceResult.value : undefined;
    const overview = overviewResult.status === "fulfilled" ? overviewResult.value : undefined;
    return (
      <div className="page-stack">
        <header className="page-header split-header"><div><span className="eyebrow">Operations command center</span><h1>{workspace?.profile.name ?? "Daily operations"}</h1><p>{overview ? `${longDate(overview.local_date)} · ${overview.timezone}` : "Workspace details are available while operational summaries recover."}</p></div><LiveStatus lastUpdated={overview?.generated_at} /></header>
        {!overview ? <section className="partial-outage"><strong>Live operational totals are temporarily unavailable.</strong><p>You can continue configuring the experience while the dashboard retries on refresh.</p></section> : <>
          <AttentionList items={buildOperationsAttentionItems(overview)} />
          <section className="metric-grid" aria-label="Daily operations metrics"><MetricCard label="Appointments today" value={overview.reservations.today} detail={`${overview.reservations.pending} pending · ${overview.reservations.confirmed} confirmed · ${overview.reservations.completed} completed`} accent /><MetricCard label="Available practitioners" value={`${overview.resources.available}/${overview.resources.total}`} detail={`${overview.resources.maintenance} unavailable`} /><MetricCard label="Open conversations" value={overview.conversations.open} detail={`${overview.conversations.staff_takeover} staff takeover`} /></section>
          <div className="overview-columns"><TodayTimeline reservations={overview.reservations.timeline} timezone={overview.timezone} /><ChannelStatus readiness={overview.channel_readiness} /></div>
        </>}
        {workspace ? <section className="panel callout-panel"><div><span className="eyebrow">Experience state</span><h2>{formatPreset(workspace.profile.preset_id)}</h2><p>{workspace.published ? `Published version ${workspace.published.version}` : "Not published yet"}{workspace.draft ? ` · Draft version ${workspace.draft.version}` : ""}</p></div><a className="primary-action" href="/admin/studio">Open Studio</a></section> : null}
      </div>
    );
  } catch (error) {
    return <SetupError message={safeSetupErrorMessage(error)} />;
  }
}

function longDate(value: string) { const date = new Date(`${value}T00:00:00Z`); return Number.isNaN(date.valueOf()) ? value : date.toLocaleDateString("en-MY", { dateStyle: "full", timeZone: "UTC" }); }

function formatPreset(value: string) {
  return value.split("_").map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`).join(" & ");
}
