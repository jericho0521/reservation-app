import {
  rescheduleReservationWithLegacyPatch,
  updateReservationWithLegacyPatch,
} from "@reservation-platform/api";
import { createSupabaseReservationMutationRepository } from "@project-play/reservations-supabase";
import type { PlatformAuthenticatedSupabaseContext } from "./route-utils";

type ReservationRouteContext = { params: Promise<{ id: string }> };
type SupabaseReservationMutationRepositoryInput = Parameters<typeof createSupabaseReservationMutationRepository>[0];

export async function updateLegacyCompatibleReservation(
  { params }: ReservationRouteContext,
  legacyPatch: unknown,
  auth: PlatformAuthenticatedSupabaseContext,
) {
  const { id } = await params;
  const result = await updateReservationWithLegacyPatch({
    repository: createSupabaseReservationMutationRepository(
      auth.supabase as unknown as SupabaseReservationMutationRepositoryInput,
    ),
    reservationId: id,
    legacyPatch,
  });

  return Response.json(result.body, { status: result.status });
}

export async function rescheduleLegacyCompatibleReservation(
  { params }: ReservationRouteContext,
  legacyPatch: unknown,
  auth: PlatformAuthenticatedSupabaseContext,
) {
  const { id } = await params;
  const result = await rescheduleReservationWithLegacyPatch({
    repository: createSupabaseReservationMutationRepository(
      auth.supabase as unknown as SupabaseReservationMutationRepositoryInput,
    ),
    reservationId: id,
    legacyPatch,
  });

  return Response.json(result.body, { status: result.status });
}
