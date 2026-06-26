import { cancelReservation } from "@reservation-platform/api";
import { createSupabaseReservationMutationRepository } from "@project-play/reservations-supabase";
import type { PlatformAuthenticatedSupabaseContext } from "./route-utils";

type ReservationRouteContext = { params: Promise<{ id: string }> };
type SupabaseReservationMutationRepositoryInput = Parameters<typeof createSupabaseReservationMutationRepository>[0];

export async function cancelLegacyCompatibleReservation(
  { params }: ReservationRouteContext,
  auth: PlatformAuthenticatedSupabaseContext,
) {
  const { id } = await params;
  const result = await cancelReservation({
    repository: createSupabaseReservationMutationRepository(
      auth.supabase as unknown as SupabaseReservationMutationRepositoryInput,
    ),
    reservationId: id,
  });

  return Response.json(result.body, { status: result.status });
}
