import { redirect } from "next/navigation";
import { SetupProgress } from "../../../components/setup/setup-progress";
import { loadOnboardingData } from "../../../lib/onboarding-loader";
import { configureBusinessSetupAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function BusinessSetupPage() {
  const data = await loadOnboardingData();
  if (data.session.role !== "owner") redirect("/");

  return <main className="setup-workspace page-stack">
    <SetupProgress current="business" state={data.state} />
    <header className="page-header">
      <span className="eyebrow">Business setup · 1 of 7</span>
      <h1>Name your appointment business</h1>
      <p>This identity and first location become the shared source for web, AI chat, and WhatsApp bookings.</p>
    </header>
    {data.business ? <section className="panel setup-summary">
      <h2>{data.business.profile.name}</h2>
      <p>Your public booking address uses <code>{data.business.profile.public_slug}</code>.</p>
      <a className="primary-action" href="/admin/setup/location">Continue to locations</a>
    </section> : <form action={configureBusinessSetupAction} className="panel studio-form setup-form">
      <div className="form-columns">
        <label>Business name<input name="name" placeholder="Serene Appointment Studio" required /></label>
        <label>Public booking slug<input name="public_slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="serene-studio" required /></label>
      </div>
      <div className="form-columns">
        <label>First location name<input name="location_name" placeholder="Main location" required /></label>
        <label>IANA timezone<input name="timezone" defaultValue="Asia/Kuala_Lumpur" required /></label>
      </div>
      <label>Address<textarea name="address" rows={3} placeholder="Optional customer-facing address" /></label>
      <div className="form-footer"><span>Creates one appointment business and its first location.</span><button className="primary-action" type="submit">Save and continue</button></div>
    </form>}
  </main>;
}
