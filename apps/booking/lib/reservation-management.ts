import {
  isPlatformError,
  type AvailabilitySlot,
  type ReservationPlatformClient,
  type ReservationResponse,
  type RescheduleManagedReservationInput,
} from "@reservation-platform/sdk";

export async function loadManagedReservation(
  client: Pick<ReservationPlatformClient, "getManagedReservation">,
  slug: string,
  token: string,
): Promise<{ found: true; reservation: ReservationResponse } | { found: false }> {
  try {
    return { found: true, reservation: await client.getManagedReservation(slug, token) };
  } catch (error) {
    if (isPlatformError(error) && error.body.status === 404) return { found: false };
    throw error;
  }
}

export async function loadManagedRescheduleAvailability(
  client: Pick<ReservationPlatformClient, "listManagedReservationAvailability">,
  slug: string,
  token: string,
  reservation: Pick<ReservationResponse, "service_id" | "staff_id" | "quantity">,
  date: string,
): Promise<AvailabilitySlot[]> {
  if (!reservation.staff_id) return [];
  const result = await client.listManagedReservationAvailability(slug, token, {
    service_id: reservation.service_id,
    date,
    quantity: reservation.quantity,
    staff_id: reservation.staff_id,
  });
  return result.slots.filter((slot) => slot.is_available && slot.available_quantity >= reservation.quantity);
}

export async function submitManagedReschedule(
  client: Pick<ReservationPlatformClient, "rescheduleManagedReservation">,
  slug: string,
  token: string,
  input: RescheduleManagedReservationInput,
): Promise<{ updated: true; reservation: ReservationResponse } | { updated: false; conflict: true }> {
  try {
    return {
      updated: true,
      reservation: await client.rescheduleManagedReservation(slug, token, input),
    };
  } catch (error) {
    if (isPlatformError(error) && error.body.status === 409) {
      return { updated: false, conflict: true };
    }
    throw error;
  }
}
