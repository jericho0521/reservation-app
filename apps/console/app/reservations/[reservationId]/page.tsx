import { notFound } from "next/navigation";
import { CancelReservationControls } from "../../../components/reservations/cancel-reservation-controls";
import { reservationChannel } from "../../../lib/reservation-operations";
import { createConsolePlatformClient } from "../../../lib/platform-client";

export const dynamic = "force-dynamic";

export default async function ReservationDetailPage({ params }: { params: Promise<{ reservationId: string }> }) {
  const { reservationId } = await params;
  try {
    const reservation = await createConsolePlatformClient().getReservation(reservationId);
    return <div className="page-stack"><div className="conversation-page-toolbar"><a href="/admin/reservations">← Back to reservations</a><span className={`reservation-state is-${reservation.status}`}>{reservation.status}</span></div><header className="page-header"><span className="eyebrow">Reservation detail</span><h1>{String(reservation.metadata?.service_name ?? "Reservation")}</h1><p>{reservation.date} · {reservation.start_time}–{reservation.end_time} · {reservationChannel(reservation)}</p></header><div className="reservation-detail-grid"><section className="detail-panel"><h2>Customer</h2><dl><Row label="Name" value={reservation.customer?.name} /><Row label="Email" value={reservation.customer?.email} /><Row label="Phone" value={reservation.customer?.phone} /><Row label="Quantity" value={String(reservation.quantity)} /></dl><h2>Assigned resources</h2>{reservation.reservation_items?.length ? <ul>{reservation.reservation_items.map((item, index) => <li key={`${item.resource_id ?? item.resource_label}:${index}`}>{item.resource_label ?? item.resource_id ?? "Resource"} · {item.quantity}</li>)}</ul> : <p className="muted">No assigned resource labels.</p>}</section><CancelReservationControls reservation={reservation} /></div></div>;
  } catch (error) { if (error && typeof error === "object" && "body" in error && (error as { body?: { status?: number } }).body?.status === 404) notFound(); throw error; }
}

function Row({ label, value }: { label: string; value?: string }) { return <div><dt>{label}</dt><dd>{value || "—"}</dd></div>; }
