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
  const appointmentMode = data.business.profile.preset_id === "appointments_salon";

  return <main className="setup-workspace page-stack">
    <SetupProgress current="services" state={data.state} />
    <header className="page-header"><span className="eyebrow">Service setup</span><h1>{appointmentMode ? "Add an appointment service" : "Add your first service"}</h1><p>{appointmentMode ? "Start with the main service customers should book. You can add and refine more services later." : "Set the service duration and the shared number of seats customers can reserve in each time slot."}</p></header>
    {activeServices.length === 0 ? <ServiceEditor onboarding appointmentOnboarding={appointmentMode} /> : <section className="panel setup-summary"><h2>Service ready</h2><ul className="setup-record-list">{activeServices.map((service) => <li key={service.service_id}><strong>{service.name}</strong><span>{service.duration_minutes ?? 60} minutes</span><small>{appointmentMode ? "Practitioner required" : `${service.total_quantity ?? 1} seats per time slot`}</small></li>)}</ul><a className="primary-action" href={appointmentMode ? "/admin/setup/staff" : "/admin/setup/hours"}>{appointmentMode ? "Continue to practitioners" : "Continue to opening hours"}</a></section>}
  </main>;
}
