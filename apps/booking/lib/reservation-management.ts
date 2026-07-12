import { isPlatformError, type ReservationPlatformClient, type ReservationResponse } from "@reservation-platform/sdk";

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
