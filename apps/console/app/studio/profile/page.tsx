import { ProfileForm } from "../../../components/studio/profile-form";
import { SetupError, safeSetupErrorMessage } from "../../../components/setup-error";
import { createConsolePlatformClient } from "../../../lib/platform-client";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  try {
    const workspace = await createConsolePlatformClient().getExperienceWorkspace();
    return <div className="page-stack"><header className="page-header"><span className="eyebrow">Experience Studio</span><h1>Business profile</h1><p>Set the identity customers use to find and recognize this venue.</p></header><section className="panel"><ProfileForm name={workspace.profile.name} publicSlug={workspace.profile.public_slug} /></section></div>;
  } catch (error) { return <SetupError message={safeSetupErrorMessage(error)} />; }
}
