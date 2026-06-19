import { supabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { PlatformCatalogRepository } from "@reservation-platform/api";
import {
  createSupabasePlatformCatalogRepository,
  createSupabaseReservationResourceLabelRepository,
  type SupabaseReservationResourceLabelRepository,
} from "@project-play/reservations-supabase";

export function createPlatformCatalogRepository(): PlatformCatalogRepository {
  return createSupabasePlatformCatalogRepository({
    publicClient: supabase(),
    adminClient: supabaseAdmin,
  });
}

export function createReservationResourceLabelRepository(): SupabaseReservationResourceLabelRepository {
  return createSupabaseReservationResourceLabelRepository(supabaseAdmin());
}
