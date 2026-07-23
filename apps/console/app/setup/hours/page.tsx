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
  const appointmentMode = data.business.profile.preset_id === "appointments_salon";
  if (!data.operatingHours) redirect(appointmentMode ? "/setup/staff" : "/setup/services");

  return <main className="setup-workspace page-stack">
    <SetupProgress current="hours" state={data.state} />
    <header className="page-header"><span className="eyebrow">Opening hours</span><h1>Set bookable hours</h1><p>The same local schedule and seat capacity control every reservation channel.</p></header>
    <AvailabilityEditor onboarding nextStep={appointmentMode ? "channels" : "review"} value={data.operatingHours} />
  </main>;
}
