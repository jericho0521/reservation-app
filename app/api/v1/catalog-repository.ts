import { supabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { PlatformCatalogRepository } from "@reservation-platform/api";
import {
  createSupabasePlatformCatalogRepository,
  createSupabaseReservationResourceLabelRepository,
  type SupabaseReservationResourceLabelRepository,
} from "@project-play/reservations-supabase";

type SupabasePlatformCatalogRepositoryInput = Parameters<typeof createSupabasePlatformCatalogRepository>[0];
type SupabaseReservationResourceLabelRepositoryInput = Parameters<typeof createSupabaseReservationResourceLabelRepository>[0];

export function createPlatformCatalogRepository(): PlatformCatalogRepository {
  const clients = {
    publicClient: supabase(),
    adminClient: supabaseAdmin,
  } as unknown as SupabasePlatformCatalogRepositoryInput;

  return createSupabasePlatformCatalogRepository(clients);
}

export function createReservationResourceLabelRepository(): SupabaseReservationResourceLabelRepository {
  return createSupabaseReservationResourceLabelRepository(
    supabaseAdmin() as unknown as SupabaseReservationResourceLabelRepositoryInput,
  );
}
