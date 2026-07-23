import { ResourceEditor } from "../../../components/studio/resource-editor";
import { SetupError, safeSetupErrorMessage } from "../../../components/setup-error";
import { createConsolePlatformClient } from "../../../lib/platform-client";

export const dynamic = "force-dynamic";

export default async function ResourcesPage() {
  try {
    const client = createConsolePlatformClient();
    const [{ services }, { resources }] = await Promise.all([client.listExperienceServices(), client.listExperienceResources()]);
    const activeServices = services.filter((service) => service.is_active !== false);
    const capacityOnly = activeServices.length > 0 && activeServices.every((service) => service.resource_strategy === "quantity");
    const pooledCapacityEmpty = capacityOnly && resources.length === 0;
    return <div className="page-stack"><header className="page-header"><span className="eyebrow">Experience Studio</span><h1>Resources</h1><p>Assigned resources are optional. Shared seat capacity is managed directly on each service.</p></header>{pooledCapacityEmpty ? <section className="panel"><h2>No individual seat records are needed</h2><p>Customers reserve from the shared seat total configured for each time slot.</p><a className="primary-action" href="/admin/studio/services">Manage seat capacity</a></section> : activeServices.length > 0 ? <section className="catalog-stack"><ResourceEditor services={services} />{resources.map((resource) => <ResourceEditor key={resource.resource_id} resource={resource} services={services} />)}</section> : <section className="panel"><h2>Create a service first</h2><p>Every assigned resource belongs to a reservable service.</p><a className="primary-action" href="/admin/studio/services">Open services</a></section>}</div>;
  } catch (error) { return <SetupError message={safeSetupErrorMessage(error)} />; }
}
