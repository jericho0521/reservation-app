import { redirect } from "next/navigation";
import { SetupProgress } from "../../../components/setup/setup-progress";
import { ServiceEditor } from "../../../components/studio/service-editor";
import { loadOnboardingData } from "../../../lib/onboarding-loader";
import { requiredPriorStep } from "../../../lib/onboarding-state";

export const dynamic = "force-dynamic";

export default async function ServicesSetupPage() {
  const data = await loadOnboardingData();
  if (!data.business) redirect("/setup/business");
  const required = requiredPriorStep(data.state, "services");
  if (required) redirect(`/setup/${required}`);
  const activeServices = data.services.filter((service) => service.is_active !== false);

  return <main className="setup-workspace page-stack">
    <SetupProgress current="services" state={data.state} />
    <header className="page-header"><span className="eyebrow">Business setup · 3 of 7</span><h1>Add an appointment service</h1><p>Start with the main service customers should book. You can add and refine more services later.</p></header>
    {activeServices.length === 0 ? <ServiceEditor onboarding /> : <section className="panel setup-summary"><h2>Services ready</h2><ul className="setup-record-list">{activeServices.map((service) => <li key={service.service_id}><strong>{service.name}</strong><span>{service.duration_minutes ?? 60} minutes</span></li>)}</ul><a className="primary-action" href="/admin/setup/staff">Continue to practitioners</a></section>}
  </main>;
}
