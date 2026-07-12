import { SetupError, safeSetupErrorMessage } from "../components/setup-error";
import { createConsolePlatformClient } from "../lib/platform-client";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  try {
    const workspace = await createConsolePlatformClient().getExperienceWorkspace();
    return (
      <div className="page-stack">
        <header className="page-header">
          <span className="eyebrow">Operations overview</span>
          <h1>{workspace.profile.name}</h1>
          <p>Your shared reservation workspace is connected and ready to configure.</p>
        </header>
        <section className="metric-grid" aria-label="Experience status">
          <article className="metric-card">
            <span>Industry preset</span>
            <strong>{formatPreset(workspace.profile.preset_id)}</strong>
          </article>
          <article className="metric-card">
            <span>Draft</span>
            <strong>{workspace.draft ? `Version ${workspace.draft.version}` : "No draft"}</strong>
          </article>
          <article className="metric-card accent-card">
            <span>Published</span>
            <strong>{workspace.published ? `Version ${workspace.published.version}` : "Not live"}</strong>
          </article>
        </section>
        <section className="panel callout-panel">
          <div>
            <span className="eyebrow">Next action</span>
            <h2>Shape the customer experience</h2>
            <p>Review the preset catalogue and current configuration in Experience Studio.</p>
          </div>
          <a className="primary-action" href="/studio">Open Studio</a>
        </section>
      </div>
    );
  } catch (error) {
    return <SetupError message={safeSetupErrorMessage(error)} />;
  }
}

function formatPreset(value: string) {
  return value.split("_").map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`).join(" & ");
}
