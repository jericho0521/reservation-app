import { NextResponse, type NextRequest } from "next/server";
import {
  listReservations,
  type PlatformTenantVenueRepository,
  type ReservationReadRepositoryPort,
} from "@reservation-platform/api";
import { createSupabaseReservationReadRepository } from "@project-play/reservations-supabase";
import {
  requirePlatformAuthenticatedSupabaseWithTenantContext,
  type PlatformAuthenticatedSupabaseOptions,
} from "./route-utils";

interface ListLegacyCompatibleReservationsOptions extends PlatformAuthenticatedSupabaseOptions {
  repository?: Pick<ReservationReadRepositoryPort, "listReservations" | "getReservationsSummary">;
  tenantVenueRepository?: PlatformTenantVenueRepository;
}

export async function listLegacyCompatibleReservations(
  request: NextRequest,
  options: ListLegacyCompatibleReservationsOptions = {},
) {
  const auth = await requirePlatformAuthenticatedSupabaseWithTenantContext(request, {
    authenticate: options.authenticate,
    repository: options.tenantVenueRepository,
    requireTenant: true,
  });
  if (auth instanceof Response) {
    return auth;
  }

  const result = await listReservations({
    repository: options.repository ?? createSupabaseReservationReadRepository(auth.context.supabase),
    search: request.nextUrl.searchParams.get("search"),
  });
  return NextResponse.json(result.body, { status: result.status });
}
