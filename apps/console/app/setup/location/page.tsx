import { redirect } from "next/navigation";
import { SetupProgress } from "../../../components/setup/setup-progress";
import { loadOnboardingData } from "../../../lib/onboarding-loader";
import { requiredPriorStep } from "../../../lib/onboarding-state";

export const dynamic = "force-dynamic";

export default async function LocationSetupPage() {
  const data = await loadOnboardingData();
  if (!data.business) redirect("/setup/business");
  if (data.business.profile.preset_id !== "appointments_salon") redirect("/setup/services");
  const required = requiredPriorStep(data.state, "location");
  if (required) redirect(`/setup/${required}`);

  return <main className="setup-workspace page-stack">
    <SetupProgress current="location" state={data.state} />
    <header className="page-header"><span className="eyebrow">Business setup · 2 of 7</span><h1>Confirm your location</h1><p>Every appointment, practitioner assignment, and opening-hours rule belongs to this first location.</p></header>
    <section className="panel setup-summary">
      <h2>Configured location</h2>
      <ul className="setup-record-list">{data.locations.map((location) => <li key={location.location_id}><strong>{location.name}</strong><span>{location.address || "No address supplied"}</span><small>{location.timezone}</small></li>)}</ul>
      <p>Additional locations will be available after per-location booking workspaces are supported. Setup continues with one fully usable location.</p>
      <a className="primary-action" href="/admin/setup/services">Use this location</a>
    </section>
  </main>;
}
