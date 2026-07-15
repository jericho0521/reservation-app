import { ResourceMaintenanceCard } from "../../components/resources/resource-maintenance-card";
import { SetupError, safeSetupErrorMessage } from "../../components/setup-error";
import { createConsolePlatformClient } from "../../lib/platform-client";
import { futureReservationWarnings } from "../../lib/reservation-operations";

export const dynamic = "force-dynamic";

export default async function ResourcesPage() {
  try {
    const client = createConsolePlatformClient();
    const [resourcesResult, servicesResult, reservationsResult] = await Promise.all([client.listResources(), client.listServices(), client.listReservations()]);
    const maintenanceResults = await Promise.all(servicesResult.services.map((service) => client.listResourceMaintenance({ service_id: service.service_id, active_only: true }).catch(() => ({ maintenance: [] }))));
    const maintenance = maintenanceResults.flatMap((result) => result.maintenance);
    const serviceNames = new Map(servicesResult.services.map((service) => [service.service_id, service.name]));
    const today = new Date().toISOString().slice(0, 10);
    return <div className="page-stack"><header className="page-header split-header"><div><span className="eyebrow">Resources & maintenance</span><h1>Protect bookable capacity</h1><p>See upcoming conflicts before taking a room, station, court, or other assigned resource offline.</p></div><span className="status-pill">{maintenance.length} active block{maintenance.length === 1 ? "" : "s"}</span></header>{resourcesResult.resources.length === 0 ? <section className="overview-empty panel"><strong>No resources configured</strong><p>Add assigned resources in Experience Studio first.</p><a className="primary-action" href="/admin/studio/resources">Configure resources</a></section> : <section className="resource-operations-grid">{resourcesResult.resources.map((resource) => <ResourceMaintenanceCard key={resource.resource_id} resource={resource} serviceName={serviceNames.get(resource.service_id ?? "") ?? "Service"} activeMaintenance={maintenance.find((entry) => entry.service_id === resource.service_id && entry.metadata?.resource_label === resource.label)} warnings={futureReservationWarnings(resource, reservationsResult.reservations, today)} />)}</section>}</div>;
  } catch (error) { return <SetupError message={safeSetupErrorMessage(error)} />; }
}
