import type { ServiceResponse } from "@reservation-platform/sdk";

export interface ReservationFilterValues { q?: string; date?: string; location?: string; practitioner?: string; status?: string; channel?: string; service?: string }

export function ReservationFilters({ services, practitioners, location, values }: { services: ServiceResponse[]; practitioners: Array<{ id: string; label: string }>; location: string; values: ReservationFilterValues }) {
  return <form className="reservation-filters appointment-filters" method="get">
    <label>Date<input type="date" name="date" defaultValue={values.date ?? ""} required /></label>
    <label>Location<select name="location" defaultValue={location}><option value={location}>{location}</option></select><small><a href="/admin/location">Change active location</a></small></label>
    <label>Practitioner<select name="practitioner" defaultValue={values.practitioner ?? ""}><option value="">All authorized</option>{practitioners.map((practitioner) => <option key={practitioner.id} value={practitioner.id}>{practitioner.label}</option>)}</select></label>
    <label>Status<select name="status" defaultValue={values.status ?? ""}><option value="">All</option><option value="pending">Pending</option><option value="confirmed">Confirmed</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option><option value="no_show">No-show</option></select></label>
    <label>Search<input name="q" defaultValue={values.q ?? ""} placeholder="Customer or booking ID" /></label>
    <label>Channel<select name="channel" defaultValue={values.channel ?? ""}><option value="">All</option><option value="web_booking">Web booking</option><option value="web_chat">Web chat</option><option value="whatsapp">WhatsApp</option><option value="simulation">Simulation</option></select></label>
    <label>Service<select name="service" defaultValue={values.service ?? ""}><option value="">All</option>{services.map((service) => <option key={service.service_id} value={service.service_id}>{service.name}</option>)}</select></label>
    <button type="submit">Apply filters</button>
  </form>;
}
