import { SetupError, safeSetupErrorMessage } from "../../components/setup-error";
import { ComponentStatus } from "../../components/system/component-status";
import { createConsolePlatformClient } from "../../lib/platform-client";
import { buildSystemAttentionItems } from "../../lib/system-status";

export const dynamic = "force-dynamic";

export default async function SystemPage() {
  try {
    const status = await createConsolePlatformClient(undefined, undefined, { includeActiveVenue: false }).getSystemStatus();
    const attention = buildSystemAttentionItems(status);
    return <div className="page-stack"><header className="page-header split-header"><div><span className="eyebrow">Installation operations</span><h1>System status</h1><p>Safe dependency health for release {status.release_version} · migration {status.migration_version}</p></div><span className={`status-pill ${status.status === "healthy" ? "ready" : "degraded"}`}>{status.status}</span></header>{attention.length ? <section className="panel"><h2>Needs attention</h2><ul>{attention.map((item) => <li key={item.label}><strong>{item.label}</strong> — {item.action}</li>)}</ul></section> : <section className="panel"><h2>All systems operational</h2><p>No recovery action is currently required.</p></section>}<section className="metric-grid" aria-label="Job queue"><article className="panel"><span className="eyebrow">Queued jobs</span><h2>{status.jobs.pending}</h2><p>Oldest age: {status.jobs.oldest_age_seconds}s</p></article><article className="panel"><span className="eyebrow">Failed jobs</span><h2>{status.jobs.failed}</h2><p>Resolve dependencies before retrying.</p></article></section><section className="system-component-grid" aria-label="System components">{Object.entries(status.components).map(([name, value]) => <ComponentStatus key={name} name={name.replaceAll("_", " ")} value={value} />)}</section></div>;
  } catch (error) {
    return <SetupError message={safeSetupErrorMessage(error)} />;
  }
}
