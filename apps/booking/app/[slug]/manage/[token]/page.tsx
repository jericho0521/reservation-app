import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createBookingPlatformClient } from "../../../../lib/platform-client";
import { loadManagedReservation } from "../../../../lib/reservation-management";

export default async function ManageReservationPage({
  params,
}: {
  params: Promise<{ slug: string; token: string }>;
}) {
  const { slug, token } = await params;
  const result = await loadManagedReservation(createBookingPlatformClient(), slug, token);
  if (!result.found) notFound();
  const reservation = result.reservation;

  async function cancelReservation() {
    "use server";
    await createBookingPlatformClient().cancelManagedReservation(slug, token);
    redirect(`/${encodeURIComponent(slug)}/manage/${encodeURIComponent(token)}`);
  }

  return <main className="manage-shell">
    <Link className="manage-back" href={`/${slug}`}>← Back to experience</Link>
    <section className="manage-card">
      <span className="experience-eyebrow">Reservation management</span>
      <h1>{reservation.status === "cancelled" ? "Reservation cancelled" : "Your reservation"}</h1>
      <p>This private link can view and manage only this reservation.</p>
      <dl>
        <div><dt>Status</dt><dd>{reservation.status}</dd></div>
        <div><dt>Date</dt><dd>{reservation.date ?? reservation.start_at?.slice(0, 10) ?? "—"}</dd></div>
        <div><dt>Time</dt><dd>{reservation.start_time ?? reservation.start_at?.slice(11, 16) ?? "—"}</dd></div>
        <div><dt>Quantity</dt><dd>{reservation.quantity}</dd></div>
      </dl>
      {reservation.status === "confirmed" ? <form action={cancelReservation}>
        <p>Cancellations close when the reservation begins.</p>
        <button type="submit">Cancel reservation</button>
      </form> : <div className="manage-cancelled">No further action is required.</div>}
    </section>
  </main>;
}
