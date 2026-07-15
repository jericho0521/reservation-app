import { redirect } from "next/navigation";
import { SetupProgress } from "../../../components/setup/setup-progress";
import { loadOnboardingData } from "../../../lib/onboarding-loader";
import { requiredPriorStep } from "../../../lib/onboarding-state";
import { createLocationSetupAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function LocationSetupPage() {
  const data = await loadOnboardingData();
  if (!data.business) redirect("/setup/business");
  const required = requiredPriorStep(data.state, "location");
  if (required) redirect(`/setup/${required}`);

  return <main className="setup-workspace page-stack">
    <SetupProgress current="location" state={data.state} />
    <header className="page-header"><span className="eyebrow">Business setup · 2 of 7</span><h1>Confirm your locations</h1><p>Every appointment, staff assignment, and opening-hours rule belongs to a location.</p></header>
    <section className="panel setup-summary">
      <h2>Configured locations</h2>
      <ul className="setup-record-list">{data.locations.map((location) => <li key={location.location_id}><strong>{location.name}</strong><span>{location.address || "No address supplied"}</span><small>{location.timezone}</small></li>)}</ul>
      <a className="primary-action" href="/admin/setup/services">Use these locations</a>
    </section>
    <details className="panel setup-details"><summary>Add another location</summary><form action={createLocationSetupAction} className="studio-form setup-form">
      <div className="form-columns"><label>Location name<input name="name" required /></label><label>IANA timezone<input name="timezone" defaultValue={data.locations[0]?.timezone ?? "Asia/Kuala_Lumpur"} required /></label></div>
      <label>Address<textarea name="address" rows={3} /></label>
      <button className="secondary-action" type="submit">Add location and continue</button>
    </form></details>
  </main>;
}
