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
      return <div className="page-stack"><ValidationSummary validation={validation} /><section className="panel"><h1>Save a draft first</h1><p>Return to the preset or branding sections to create a draft before previewing and publishing.</p></section></div>;
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
