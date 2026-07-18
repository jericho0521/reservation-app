import { ExperiencePreview } from "../../../components/studio/experience-preview";
import { PublishPanel } from "../../../components/studio/publish-panel";
import { SetupError, safeSetupErrorMessage } from "../../../components/setup-error";
import { ValidationSummary } from "../../../components/studio/validation-summary";
import { createConsolePlatformClient } from "../../../lib/platform-client";

export const dynamic = "force-dynamic";

export default async function PublishPage() {
  try {
    const client = createConsolePlatformClient();
    const [workspace, validation, { services }] = await Promise.all([
      client.getExperienceWorkspace(),
      client.validateExperienceWorkspace(),
      client.listExperienceServices(),
    ]);
    if (!workspace.draft) {
      return workspace.published
        ? <div className="page-stack"><header className="page-header"><span className="eyebrow">Experience Studio</span><h1>Experience published</h1><p>Version {workspace.published.version} is live for customers.</p></header><section className="panel callout-panel"><div><h2>Publication complete</h2><p>Your saved configuration is now the customer-facing experience. Create another revision only when you are ready to make further changes.</p></div><div className="form-footer"><a className="primary-action" href={`/${workspace.profile.public_slug}`}>View public experience</a><a className="secondary-action" href="/admin/studio/profile">Create next revision</a></div></section></div>
        : <div className="page-stack"><ValidationSummary validation={validation} /><section className="panel"><h1>Save a draft first</h1><p>Return to the preset or branding sections to create a draft before previewing and publishing.</p></section></div>;
    }

    return <div className="page-stack">
      <header className="page-header">
        <span className="eyebrow">Experience Studio</span>
        <h1>Preview & publish</h1>
        <p>Review the exact saved draft, resolve linked validation issues, then deliberately replace the live customer experience.</p>
      </header>
      <ExperiencePreview draft={workspace.draft} services={services.filter((service) => service.is_active !== false)} />
      <ValidationSummary validation={validation} />
      <PublishPanel
        configurationId={workspace.draft.configuration_id}
        draftVersion={workspace.draft.version}
        valid={validation.valid}
        publishedVersion={workspace.published?.version}
        publishedAt={workspace.published?.published_at}
      />
    </div>;
  } catch (error) {
    return <SetupError message={safeSetupErrorMessage(error)} />;
  }
}
