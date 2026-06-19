import {
  createReservation,
  legacyBookingCreateToReservation,
  type ReservationCreateRepositoryPort,
} from "@reservation-platform/api";
import type { SupabaseReservationRepository } from "@project-play/reservations-supabase";
import { createPlatformReservationRepository } from "./reservation-repository";

type ReservationRepositoryFactory = () => Pick<SupabaseReservationRepository, "createReservationAtomic">;

export { legacyBookingCreateToReservation };

export async function createLegacyReservationResponse(
  legacyInput: unknown,
  createRepository: ReservationRepositoryFactory = createPlatformReservationRepository,
) {
  const result = await createReservation({
    repository: () => createRepository() as ReservationCreateRepositoryPort,
    legacyInput,
  });

  return Response.json(result.body, { status: result.status });
}
