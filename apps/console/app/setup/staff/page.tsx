import { redirect } from "next/navigation";
import { SetupProgress } from "../../../components/setup/setup-progress";
import { ResourceEditor } from "../../../components/studio/resource-editor";
import { loadOnboardingData } from "../../../lib/onboarding-loader";
import { requiredPriorStep } from "../../../lib/onboarding-state";

export const dynamic = "force-dynamic";

export default async function StaffSetupPage() {
  const data = await loadOnboardingData();
  if (!data.business) redirect("/setup/business");
  const required = requiredPriorStep(data.state, "staff");
  if (required) redirect(`/setup/${required}`);
  const activeServices = data.services.filter((service) => service.is_active !== false);
  if (activeServices.length === 0) redirect("/setup/services");
  const practitioners = data.resources.filter((resource) => resource.is_active !== false);

  return <main className="setup-workspace page-stack">
    <SetupProgress current="staff" state={data.state} />
    <header className="page-header"><span className="eyebrow">Business setup · 4 of 7</span><h1>Add a practitioner</h1><p>This is the person or bookable specialist who fulfils the selected service. Login access is managed separately.</p></header>
    {practitioners.length === 0 ? <ResourceEditor onboarding services={activeServices} /> : <section className="panel setup-summary"><h2>Practitioners ready</h2><ul className="setup-record-list">{practitioners.map((resource) => <li key={resource.resource_id}><strong>{resource.label}</strong><span>{activeServices.find((service) => service.service_id === resource.service_id)?.name ?? "Appointment service"}</span></li>)}</ul><a className="primary-action" href="/admin/setup/hours">Continue to hours</a></section>}
  </main>;
}
