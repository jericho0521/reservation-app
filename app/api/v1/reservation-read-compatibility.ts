import { NextResponse } from "next/server";
import {
  readReservationById,
  type PlatformTenantVenueRepository,
  type ReservationReadRepositoryPort,
} from "@reservation-platform/api";
import { createSupabaseReservationReadRepository } from "@project-play/reservations-supabase";
import {
  requirePlatformAuthenticatedSupabaseWithTenantContext,
  type PlatformAuthenticatedSupabaseOptions,
} from "./route-utils";

type ReservationRouteContext = { params: Promise<{ id: string }> };
type SupabaseReservationReadRepositoryInput = Parameters<typeof createSupabaseReservationReadRepository>[0];

interface ReadLegacyCompatibleReservationOptions extends PlatformAuthenticatedSupabaseOptions {
  repository?: Pick<ReservationReadRepositoryPort, "readReservationById">;
  tenantVenueRepository?: PlatformTenantVenueRepository;
}

export async function readLegacyCompatibleReservation(
  request: Request,
  { params }: ReservationRouteContext,
  options: ReadLegacyCompatibleReservationOptions = {},
) {
  const auth = await requirePlatformAuthenticatedSupabaseWithTenantContext(request, {
    authenticate: options.authenticate,
    repository: options.tenantVenueRepository,
    requireTenant: true,
  });
  if (auth instanceof Response) {
    return auth;
  }

  const { id } = await params;
  const result = await readReservationById({
    repository: options.repository ?? createSupabaseReservationReadRepository(
      auth.context.supabase as unknown as SupabaseReservationReadRepositoryInput,
    ),
    reservationId: id,
  });

  return NextResponse.json(result.body, { status: result.status });
}
