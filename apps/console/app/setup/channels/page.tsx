import { redirect } from "next/navigation";
import { ChannelSettings } from "../../../components/studio/channel-settings";
import { SetupProgress } from "../../../components/setup/setup-progress";
import { loadOnboardingData } from "../../../lib/onboarding-loader";
import { requiredPriorStep } from "../../../lib/onboarding-state";

export const dynamic = "force-dynamic";

export default async function ChannelsSetupPage() {
  const data = await loadOnboardingData();
  if (!data.business) redirect("/setup/business");
  if (data.business.profile.preset_id !== "appointments_salon") redirect("/setup/review");
  const required = requiredPriorStep(data.state, "channels");
  if (required) redirect(`/setup/${required}`);
  if (!data.channels) redirect("/setup/hours");

  return <main className="setup-workspace page-stack">
    <SetupProgress current="channels" state={data.state} />
    <header className="page-header"><span className="eyebrow">Business setup · 6 of 7</span><h1>Choose customer channels</h1><p>Web booking is the production baseline. AI chat and WhatsApp remain optional until their provider setup is ready.</p></header>
    <ChannelSettings onboarding value={data.channels} />
    <section className="panel setup-summary" aria-labelledby="email-delivery-status">
      <span className={`status-pill ${data.email?.enabled && data.email.configured ? "ready" : "degraded"}`}>{data.email?.enabled && data.email.configured ? "Email ready" : "Optional setup"}</span>
      <h2 id="email-delivery-status">{data.email?.enabled && data.email.configured ? "Appointment email is configured" : "Connect appointment email"}</h2>
      <p>{data.email?.enabled && data.email.configured ? "The worker can use your saved SMTP connection for confirmation and reminder delivery." : "Web booking can be published without email. Add your SMTP account now or return to it from owner settings."}</p>
      <a className="secondary-action" href="/admin/settings/email">Configure email delivery</a>
    </section>
  </main>;
}
