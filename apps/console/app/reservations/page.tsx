import { cookies } from "next/headers";
import { AppointmentCalendar } from "../../components/reservations/appointment-calendar";
import { ReservationFilters } from "../../components/reservations/reservation-filters";
import { StaffAppointmentCreate } from "../../components/reservations/staff-appointment-create";
import { SetupError, safeSetupErrorMessage } from "../../components/setup-error";
import { LiveStatus } from "../../components/live-status";
import { activeVenueCookieName } from "../../lib/auth-session";
import { filterAppointments, isAppointmentStatus } from "../../lib/appointment-view";
import { createConsolePlatformClient } from "../../lib/platform-client";
import { buildPractitionerOptions } from "../../lib/practitioner-options";

export const dynamic = "force-dynamic";

interface ReservationSearchParams { q?: string; date?: string; location?: string; practitioner?: string; status?: string; channel?: string; service?: string }

export default async function ReservationsPage({ searchParams }: { searchParams: Promise<ReservationSearchParams> }) {
  try {
    const filters = await searchParams;
    const client = createConsolePlatformClient();
    const [overview, session] = await Promise.all([client.getOperationsOverview(), client.getSession()]);
    const date = validDate(filters.date) ? filters.date : overview.local_date;
    const [result, services, resources] = await Promise.all([
      client.listReservations({
        ...(filters.q ? { search: filters.q } : {}),
        start_at: `${date}T00:00:00`,
        end_at: `${date}T23:59:59`,
        ...(filters.practitioner ? { staff_id: filters.practitioner } : {}),
        ...(filters.status && isAppointmentStatus(filters.status) ? { status: filters.status } : {}),
        ...(filters.service ? { service_id: filters.service } : {}),
      }),
      client.listServices(),
      client.listResources(),
    ]);
    const selectedCookie = (await cookies()).get(activeVenueCookieName)?.value;
    const activeLocation = selectedCookie && session.venue_ids.includes(selectedCookie) ? selectedCookie : session.venue_ids[0] ?? "";
    const requestedLocation = filters.location ?? activeLocation;
    const practitioners = buildPractitionerOptions(result.reservations, resources.resources);
    const appointments = filterAppointments(result.reservations, {
      date,
      venueId: requestedLocation,
      practitionerId: filters.practitioner,
      status: filters.status,
      search: filters.q,
      channel: filters.channel,
      serviceId: filters.service,
      authorizedVenueIds: session.venue_ids,
    });
    const values = { ...filters, date, location: requestedLocation };
    return <div className="page-stack"><header className="page-header split-header"><div><span className="eyebrow">Reservations</span><h1>Operate the working day</h1><p>Review the daily schedule and move each reservation through its lifecycle.</p><span className="status-pill">{appointments.length} shown</span></div><LiveStatus lastUpdated={appointments[0]?.updated_at ?? overview.generated_at} /></header><StaffAppointmentCreate date={date} services={services.services} resources={resources.resources} practitioners={practitioners} /><ReservationFilters services={services.services} practitioners={practitioners} location={activeLocation} values={values} /><AppointmentCalendar appointments={appointments} date={date} timezone={overview.timezone} practitioners={practitioners} services={services.services} /></div>;
  } catch (error) { return <SetupError message={safeSetupErrorMessage(error)} />; }
}

function validDate(value?: string): value is string { return Boolean(value && /^\d{4}-\d{2}-\d{2}$/u.test(value) && !Number.isNaN(new Date(`${value}T12:00:00Z`).valueOf())); }
