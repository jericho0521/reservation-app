import { ServiceEditor } from "../../../components/studio/service-editor";
import { SetupError, safeSetupErrorMessage } from "../../../components/setup-error";
import { createConsolePlatformClient } from "../../../lib/platform-client";

export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  try {
    const { services } = await createConsolePlatformClient().listExperienceServices();
    return <div className="page-stack"><header className="page-header"><span className="eyebrow">Experience Studio</span><h1>Services</h1><p>Define what customers can book. Archive services instead of deleting reservation history.</p></header><section className="catalog-stack"><ServiceEditor />{services.map((service) => <ServiceEditor key={service.service_id} service={service} />)}</section></div>;
  } catch (error) { return <SetupError message={safeSetupErrorMessage(error)} />; }
}
