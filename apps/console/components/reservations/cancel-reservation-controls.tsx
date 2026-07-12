import type { ReservationResponse } from "@reservation-platform/sdk";
import { cancelReservationAction } from "../../app/reservations/actions";

export function CancelReservationControls({ reservation }: { reservation: ReservationResponse }) {
  if (reservation.status === "cancelled") return <aside className="destructive-panel is-complete"><h2>Reservation cancelled</h2><p>No further cancellation action is available.</p></aside>;
  return <aside className="destructive-panel"><span className="eyebrow">Destructive action</span><h2>Cancel reservation</h2><p>This releases the booked capacity. The reason is recorded with the owner action.</p><form action={cancelReservationAction} className="studio-form"><input type="hidden" name="reservation_id" value={reservation.reservation_id} /><label>Audit reason<textarea name="reason" rows={3} required placeholder="Why is this booking being cancelled?" /></label><label className="publish-confirmation"><input type="checkbox" name="confirm_cancel" required /><span>I understand this changes availability immediately.</span></label><button className="danger-action" type="submit">Cancel reservation</button></form></aside>;
}
