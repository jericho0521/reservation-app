import type { AnalyticsResponse } from "@reservation-platform/sdk";
import { demandChartPoints } from "../../lib/analytics-view";

export function DemandChart({ days }: { days: AnalyticsResponse["reservations_by_day"] }) {
  const points = demandChartPoints(days); const path = points.map((point) => `${point.x},${point.y}`).join(" ");
  return <section className="demand-panel"><header><h2>Reservation demand by day</h2><p>Total bookings created for each reservation date.</p></header>{points.length === 0 ? <p className="muted panel-padding">No daily demand to chart.</p> : <><svg viewBox="0 0 600 200" role="img" aria-label="Reservation demand line chart"><line x1="0" y1="180" x2="600" y2="180" /><polyline points={path} /><g>{points.map((point) => <circle key={point.date} cx={point.x} cy={point.y} r="5"><title>{point.date}: {point.total} reservations</title></circle>)}</g></svg><div className="responsive-table"><table><thead><tr><th>Date</th><th>Total</th><th>Confirmed</th><th>Completed</th><th>Cancelled</th></tr></thead><tbody>{days.map((day) => <tr key={day.date}><td>{day.date}</td><td>{day.total}</td><td>{day.confirmed}</td><td>{day.completed}</td><td>{day.cancelled}</td></tr>)}</tbody></table></div></>}</section>;
}
