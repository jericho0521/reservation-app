import { notFound } from "next/navigation";
import { AppointmentStatusActions } from "../../../components/reservations/appointment-status-actions";
import { statusLabel } from "../../../lib/appointment-view";
import { reservationChannel } from "../../../lib/reservation-operations";
import { createConsolePlatformClient } from "../../../lib/platform-client";
import { requiresOwnerResourceSelection } from "../../../lib/reservation-resource-selection";

export const dynamic = "force-dynamic";

export default async function ReservationDetailPage({ params }: { params: Promise<{ reservationId: string }> }) {
  const { reservationId } = await params;
  try {
    const client = createConsolePlatformClient();
    const reservation = await client.getReservation(reservationId);
    const [resources, services] = await Promise.all([
      client.listResources({ service_id: reservation.service_id }),
      client.listServices({ include_inactive: true }),
    ]);
    const service = services.services.find((entry) => entry.service_id === reservation.service_id);
    const practitioner = resources.resources.find((resource) => resource.metadata?.platform_staff_id === reservation.staff_id)?.label ?? reservation.staff_id;
    return <div className="page-stack"><div className="conversation-page-toolbar"><a href="/admin/reservations">← Back to daily schedule</a><span className={`reservation-state is-${reservation.status}`}>{statusLabel(reservation.status)}</span></div><header className="page-header"><span className="eyebrow">Reservation detail</span><h1>{String(reservation.metadata?.service_name ?? service?.name ?? "Reservation")}</h1><p>{reservation.date}, {reservation.start_time} to {reservation.end_time}, {reservationChannel(reservation)}</p></header><div className="reservation-detail-grid"><section className="detail-panel"><h2>Customer</h2><dl><Row label="Name" value={reservation.customer?.name} /><Row label="Email" value={reservation.customer?.email} /><Row label="Phone" value={reservation.customer?.phone} /><Row label="Seats" value={String(reservation.quantity)} />{reservation.staff_id ? <Row label="Practitioner" value={practitioner} /> : null}<Row label="Location" value={reservation.venue_id} /></dl>{reservation.reservation_items?.length ? <><h2>Assigned resources</h2><ul>{reservation.reservation_items.map((item, index) => <li key={`${item.resource_id ?? item.resource_label}:${index}`}>{item.resource_label ?? item.resource_id ?? "Resource"}, {item.quantity}</li>)}</ul></> : null}</section><AppointmentStatusActions reservation={reservation} maximumQuantity={service?.total_quantity} resourceSelectionRequired={requiresOwnerResourceSelection(service)} /></div></div>;
  } catch (error) { if (error && typeof error === "object" && "body" in error && (error as { body?: { status?: number } }).body?.status === 404) notFound(); throw error; }
}

function Row({ label, value }: { label: string; value?: string }) { return <div><dt>{label}</dt><dd>{value || "Not set"}</dd></div>; }
