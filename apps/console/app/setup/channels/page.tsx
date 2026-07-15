import { redirect } from "next/navigation";
import { ChannelSettings } from "../../../components/studio/channel-settings";
import { SetupProgress } from "../../../components/setup/setup-progress";
import { loadOnboardingData } from "../../../lib/onboarding-loader";
import { requiredPriorStep } from "../../../lib/onboarding-state";

export const dynamic = "force-dynamic";

export default async function ChannelsSetupPage() {
  const data = await loadOnboardingData();
  if (!data.business) redirect("/setup/business");
  const required = requiredPriorStep(data.state, "channels");
  if (required) redirect(`/setup/${required}`);
  if (!data.channels) redirect("/setup/hours");

  return <main className="setup-workspace page-stack">
    <SetupProgress current="channels" state={data.state} />
    <header className="page-header"><span className="eyebrow">Business setup · 6 of 7</span><h1>Choose customer channels</h1><p>Web booking is the production baseline. AI chat and WhatsApp remain optional until their provider setup is ready.</p></header>
    <ChannelSettings onboarding value={data.channels} />
    <section className="panel setup-summary" aria-labelledby="email-delivery-status">
      <span className="status-pill">Phase 3 integration</span>
      <h2 id="email-delivery-status">Appointment emails are not configured yet</h2>
      <p>Web booking can be published now. Confirmation and reminder email delivery will be enabled in Phase 3 and is not counted as ready by this setup wizard.</p>
    </section>
  </main>;
}
