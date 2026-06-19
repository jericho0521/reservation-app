import { createSupabaseReservationRepository } from "@project-play/reservations-supabase";
import { supabaseAdmin } from "@/lib/supabase-admin";

type SupabaseReservationRepositoryClient = Parameters<typeof createSupabaseReservationRepository>[0];

export function createPlatformReservationRepository() {
  return createSupabaseReservationRepository(
    supabaseAdmin() as unknown as SupabaseReservationRepositoryClient,
  );
}
