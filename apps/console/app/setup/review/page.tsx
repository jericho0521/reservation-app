import { redirect } from "next/navigation";
import { ExperiencePreview } from "../../../components/studio/experience-preview";
import { PublishPanel } from "../../../components/studio/publish-panel";
import { ValidationSummary } from "../../../components/studio/validation-summary";
import { SetupProgress } from "../../../components/setup/setup-progress";
import { loadOnboardingData } from "../../../lib/onboarding-loader";
import { requiredPriorStep } from "../../../lib/onboarding-state";

export const dynamic = "force-dynamic";

export default async function ReviewSetupPage() {
  const data = await loadOnboardingData();
  if (!data.business) redirect("/setup/business");
  const required = requiredPriorStep(data.state, "review");
  if (required) redirect(`/setup/${required}`);
  if (!data.workspace?.draft) redirect(data.state.nextStep ? `/setup/${data.state.nextStep}` : "/setup/business");
  const services = data.services.filter((service) => service.is_active !== false);

  return <main className="setup-workspace page-stack">
    <SetupProgress current="review" state={data.state} />
    <header className="page-header"><span className="eyebrow">Business setup · 7 of 7</span><h1>Review and publish</h1><p>Check the saved customer experience, resolve any linked issue, then make it live deliberately.</p></header>
    <ExperiencePreview draft={data.workspace.draft} services={services} />
    {data.state.emailDelivery === "phase_3_pending" ? <section className="panel setup-summary"><h2>Email delivery follows in Phase 3</h2><p>Publishing enables the public web booking flow. It does not claim that confirmation or reminder emails are already available.</p></section> : null}
    <ValidationSummary validation={data.validation} />
    <PublishPanel configurationId={data.workspace.draft.configuration_id} draftVersion={data.workspace.draft.version} valid={data.validation.valid && data.state.canPublish} publishedVersion={data.workspace.published?.version} publishedAt={data.workspace.published?.published_at} onboarding />
  </main>;
}
