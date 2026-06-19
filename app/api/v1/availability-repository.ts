import { supabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createSupabaseAvailabilityRepository } from "@project-play/reservations-supabase";
import type { AvailabilityRepositoryPort } from "@reservation-platform/api";

type SupabaseAvailabilityRepositoryInput = Parameters<typeof createSupabaseAvailabilityRepository>[0];

export function createPlatformAvailabilityRepository(): AvailabilityRepositoryPort {
  return createSupabaseAvailabilityRepository({
    publicClient: supabase(),
    adminClient: supabaseAdmin,
  } as unknown as SupabaseAvailabilityRepositoryInput);
}
