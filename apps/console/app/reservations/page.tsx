import { ReservationFilters } from "../../components/reservations/reservation-filters";
import { ReservationList } from "../../components/reservations/reservation-list";
import { SetupError, safeSetupErrorMessage } from "../../components/setup-error";
import { LiveStatus } from "../../components/live-status";
import { createConsolePlatformClient } from "../../lib/platform-client";
import { filterReservations } from "../../lib/reservation-operations";

export const dynamic = "force-dynamic";

export default async function ReservationsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; channel?: string; service?: string }> }) {
  try {
    const filters = await searchParams;
    const client = createConsolePlatformClient();
    const [result, services] = await Promise.all([client.listReservations(filters.q ? { search: filters.q } : {}), client.listServices()]);
    const reservations = filterReservations(result.reservations, { search: filters.q, status: filters.status, channel: filters.channel, serviceId: filters.service });
    return <div className="page-stack"><header className="page-header split-header"><div><span className="eyebrow">Reservations</span><h1>Find every booking</h1><p>Search customers, filter operational state and channel, then inspect or cancel with an audit reason.</p><span className="status-pill">{reservations.length} shown</span></div><LiveStatus lastUpdated={reservations[0]?.updated_at} /></header><ReservationFilters services={services.services} values={filters} /><ReservationList reservations={reservations} /></div>;
  } catch (error) { return <SetupError message={safeSetupErrorMessage(error)} />; }
}
