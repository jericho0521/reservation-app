import { ResourceEditor } from "../../../components/studio/resource-editor";
import { SetupError, safeSetupErrorMessage } from "../../../components/setup-error";
import { createConsolePlatformClient } from "../../../lib/platform-client";

export const dynamic = "force-dynamic";

export default async function ResourcesPage() {
  try {
    const client = createConsolePlatformClient();
    const [{ services }, { resources }] = await Promise.all([client.listExperienceServices(), client.listExperienceResources()]);
    return <div className="page-stack"><header className="page-header"><span className="eyebrow">Experience Studio</span><h1>Resources</h1><p>Assign the rooms, staff, stations, courts, or equipment used to fulfill bookings.</p></header>{services.some((service) => service.is_active !== false) ? <section className="catalog-stack"><ResourceEditor services={services} />{resources.map((resource) => <ResourceEditor key={resource.resource_id} resource={resource} services={services} />)}</section> : <section className="panel"><h2>Create a service first</h2><p>Every resource belongs to a reservable service.</p><a className="primary-action" href="/admin/studio/services">Open services</a></section>}</div>;
  } catch (error) { return <SetupError message={safeSetupErrorMessage(error)} />; }
}
