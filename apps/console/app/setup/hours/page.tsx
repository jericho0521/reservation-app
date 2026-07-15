import { redirect } from "next/navigation";
import { SetupProgress } from "../../../components/setup/setup-progress";
import { AvailabilityEditor } from "../../../components/studio/availability-editor";
import { loadOnboardingData } from "../../../lib/onboarding-loader";
import { requiredPriorStep } from "../../../lib/onboarding-state";

export const dynamic = "force-dynamic";

export default async function HoursSetupPage() {
  const data = await loadOnboardingData();
  if (!data.business) redirect("/setup/business");
  const required = requiredPriorStep(data.state, "hours");
  if (required) redirect(`/setup/${required}`);
  if (!data.operatingHours) redirect("/setup/staff");

  return <main className="setup-workspace page-stack">
    <SetupProgress current="hours" state={data.state} />
    <header className="page-header"><span className="eyebrow">Business setup · 5 of 7</span><h1>Set bookable hours</h1><p>The same location-local schedule controls every booking channel.</p></header>
    <AvailabilityEditor onboarding value={data.operatingHours} />
  </main>;
}
