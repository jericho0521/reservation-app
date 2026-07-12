import { BrandingForm } from "../../../components/studio/branding-form";
import { SetupError, safeSetupErrorMessage } from "../../../components/setup-error";
import { createConsolePlatformClient } from "../../../lib/platform-client";

export const dynamic = "force-dynamic";

export default async function BrandingPage() {
  try {
    const workspace = await createConsolePlatformClient().getExperienceWorkspace();
    const configuration = workspace.draft ?? workspace.published;
    if (!configuration) throw new Error("Create an experience draft before editing branding.");
    return <div className="page-stack"><header className="page-header"><span className="eyebrow">Experience Studio</span><h1>Branding & terminology</h1><p>Change how the shared booking experience looks and speaks.</p></header><section className="panel"><BrandingForm branding={configuration.branding} terminology={configuration.terminology} /></section></div>;
  } catch (error) { return <SetupError message={safeSetupErrorMessage(error)} />; }
}
