import type { OperationsTimelineReservation } from "@reservation-platform/sdk";
import { channelLabel } from "../../lib/operations-view";

export function TodayTimeline({ reservations, timezone }: { reservations: OperationsTimelineReservation[]; timezone: string }) {
  return <section className="overview-panel"><header><div><span className="eyebrow">Today</span><h2>Reservation timeline</h2></div><a href="/reservations">View all</a></header>{reservations.length === 0 ? <div className="overview-empty"><strong>No bookings today</strong><p>New web and conversational reservations will appear here.</p></div> : <ol className="today-timeline">{reservations.map((reservation) => <li key={reservation.reservation_id}><time>{formatTime(reservation.start_time)}</time><a href={`/reservations/${encodeURIComponent(reservation.reservation_id)}`}><strong>{reservation.service_name}</strong><span>{reservation.customer_name} · {reservation.quantity} guest{reservation.quantity === 1 ? "" : "s"}</span></a><div><span className={`reservation-state is-${reservation.status}`}>{reservation.status}</span><small>{channelLabel(reservation.channel)}</small></div></li>)}</ol>}<small className="panel-footnote">Times shown in {timezone}.</small></section>;
}

function formatTime(value: string) { return value.slice(0, 5); }
