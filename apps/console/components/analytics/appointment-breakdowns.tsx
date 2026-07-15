import type { AnalyticsResponse } from "@reservation-platform/sdk";
import { percent } from "../../lib/analytics-view";

export function AppointmentBreakdowns({ analytics }: { analytics: AnalyticsResponse }) {
  return <div className="analytics-columns appointment-breakdowns">
    <section className="analytics-table-panel">
      <header><h2>Practitioner utilization</h2><p>Booked appointment minutes compared with configured opening hours.</p></header>
      {analytics.practitioner_utilization.length === 0
        ? <p className="muted panel-padding">No active practitioners are assigned to this location.</p>
        : <div className="responsive-table"><table><thead><tr><th>Practitioner</th><th>Booked</th><th>Available</th><th>Utilization</th></tr></thead><tbody>{analytics.practitioner_utilization.map((row) => <tr key={row.staff_id}><td>{row.display_name}</td><td>{minutes(row.booked_minutes)}</td><td>{minutes(row.available_minutes)}</td><td><span className="utilization-value">{percent(row.utilization_rate)}</span><meter min="0" max="1" value={row.utilization_rate} aria-label={`${row.display_name} utilization`} /></td></tr>)}</tbody></table></div>}
    </section>
    <section className="analytics-table-panel">
      <header><h2>Location volume</h2><p>Appointments in the selected operating location.</p></header>
      {analytics.locations.length === 0
        ? <p className="muted panel-padding">No location activity in this range.</p>
        : <div className="responsive-table"><table><thead><tr><th>Location</th><th>Appointments</th></tr></thead><tbody>{analytics.locations.map((row) => <tr key={row.venue_id}><td>{row.name}</td><td>{row.reservations}</td></tr>)}</tbody></table></div>}
    </section>
  </div>;
}

function minutes(value: number) {
  const hours = Math.floor(value / 60); const remainder = value % 60;
  return hours > 0 ? `${hours}h${remainder ? ` ${remainder}m` : ""}` : `${remainder}m`;
}
