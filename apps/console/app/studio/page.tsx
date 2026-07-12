import { SetupError, safeSetupErrorMessage } from "../../components/setup-error";
import { createConsolePlatformClient } from "../../lib/platform-client";

export const dynamic = "force-dynamic";

export default async function StudioPage() {
  try {
    const client = createConsolePlatformClient();
    const [presetResult, workspace] = await Promise.all([
      client.listExperiencePresets(),
      client.getExperienceWorkspace(),
    ]);

    return (
      <div className="page-stack">
        <header className="page-header split-header">
          <div>
            <span className="eyebrow">Experience Studio</span>
            <h1>Choose how your business books</h1>
            <p>Every preset uses the same availability and reservation engine.</p>
          </div>
          <span className="status-pill">Phase 1 · Read only</span>
        </header>
        <section className="preset-grid" aria-label="Industry presets">
          {presetResult.presets.map((preset) => {
            const selected = preset.preset_id === workspace.profile.preset_id;
            return (
              <article className={`preset-card${selected ? " selected" : ""}`} key={preset.preset_id}>
                <div className="preset-card-top">
                  <span className="preset-icon" aria-hidden="true">{preset.name.slice(0, 1)}</span>
                  {selected ? <span className="selected-label">Current</span> : null}
                </div>
                <h2>{preset.name}</h2>
                <p>{preset.description}</p>
                <dl>
                  <div><dt>Customer</dt><dd>{preset.terminology.customer}</dd></div>
                  <div><dt>Resource</dt><dd>{preset.terminology.resource}</dd></div>
                  <div><dt>Booking</dt><dd>{preset.terminology.booking}</dd></div>
                </dl>
              </article>
            );
          })}
        </section>
      </div>
    );
  } catch (error) {
    return <SetupError message={safeSetupErrorMessage(error)} />;
  }
}
