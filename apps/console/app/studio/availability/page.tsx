import Link from "next/link";
import { AvailabilityEditor } from "../../../components/studio/availability-editor";
import { SetupError, safeSetupErrorMessage } from "../../../components/setup-error";
import { createConsolePlatformClient } from "../../../lib/platform-client";

export const dynamic = "force-dynamic";

export default async function AvailabilityPage() {
  try {
    const operatingHours = await createConsolePlatformClient().getExperienceOperatingHours();

    return <main className="section-foundation">
      <header className="split-header">
        <div>
          <p className="eyebrow">Experience Studio · Availability</p>
          <h1>Set bookable hours</h1>
          <p className="muted">These venue-local rules constrain web, AI chat, and WhatsApp availability through the same engine.</p>
        </div>
        <Link href="/studio/resources" className="secondary-action">Back to resources</Link>
      </header>
      <AvailabilityEditor value={operatingHours} />
    </main>;
  } catch (error) {
    return <SetupError message={safeSetupErrorMessage(error)} />;
  }
}
