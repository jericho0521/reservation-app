import { cookies } from "next/headers";
import { AppointmentCalendar } from "../../components/reservations/appointment-calendar";
import { ReservationFilters } from "../../components/reservations/reservation-filters";
import { StaffAppointmentCreate } from "../../components/reservations/staff-appointment-create";
import { SetupError, safeSetupErrorMessage } from "../../components/setup-error";
import { LiveStatus } from "../../components/live-status";
import { activeVenueCookieName } from "../../lib/auth-session";
import { filterAppointments, isAppointmentStatus } from "../../lib/appointment-view";
import { createConsolePlatformClient } from "../../lib/platform-client";

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
    const practitioners = practitionerOptions(result.reservations, resources.resources);
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
    return <div className="page-stack"><header className="page-header split-header"><div><span className="eyebrow">Appointment command center</span><h1>Operate the working day</h1><p>Filter the authorized daily schedule, resolve pending work, and move each appointment through an explicit lifecycle.</p><span className="status-pill">{appointments.length} shown</span></div><LiveStatus lastUpdated={appointments[0]?.updated_at ?? overview.generated_at} /></header><StaffAppointmentCreate date={date} services={services.services} practitioners={practitioners} /><ReservationFilters services={services.services} practitioners={practitioners} location={activeLocation} values={values} /><AppointmentCalendar appointments={appointments} date={date} timezone={overview.timezone} practitioners={practitioners} services={services.services} /></div>;
  } catch (error) { return <SetupError message={safeSetupErrorMessage(error)} />; }
}

function validDate(value?: string): value is string { return Boolean(value && /^\d{4}-\d{2}-\d{2}$/u.test(value) && !Number.isNaN(new Date(`${value}T12:00:00Z`).valueOf())); }

function practitionerOptions(reservations: Array<{ staff_id?: string; metadata?: Record<string, unknown> }>, resources: Array<{ resource_id: string; service_id?: string; label: string; metadata?: Record<string, unknown> }>) {
  const labels = new Map<string, { id: string; label: string; serviceId?: string }>();
  for (const resource of resources) {
    const staffId = resource.metadata?.platform_staff_id;
    if (typeof staffId === "string") labels.set(staffId, { id: staffId, label: resource.label, ...(resource.service_id ? { serviceId: resource.service_id } : {}) });
  }
  for (const reservation of reservations) {
    if (!reservation.staff_id) continue;
    const named = reservation.metadata?.staff_name;
    if (!labels.has(reservation.staff_id)) labels.set(reservation.staff_id, { id: reservation.staff_id, label: typeof named === "string" ? named : `Practitioner ${reservation.staff_id.slice(0, 8)}` });
  }
  return [...labels.values()].sort((left, right) => left.label.localeCompare(right.label));
}
