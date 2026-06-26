import { endResourceMaintenance } from "@reservation-platform/api";
import { endResourceMaintenanceInputSchema } from "@reservation-platform/contract-types";
import { createSupabaseResourceMaintenanceRepository } from "@project-play/reservations-supabase";
import {
  platformJsonError,
  requirePlatformAuthenticatedSupabaseWithTenantContext,
  requireTenantScopedRecordBinding,
  resolveBackendRuntimeIdempotencyRepository,
  runJsonMutationIdempotently,
} from "../../../route-utils";

type SupabaseResourceMaintenanceRepositoryInput = Parameters<typeof createSupabaseResourceMaintenanceRepository>[0];

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return runJsonMutationIdempotently({
      request,
      repository: resolveBackendRuntimeIdempotencyRepository,
      beforeIdempotency: () => requirePlatformAuthenticatedSupabaseWithTenantContext(request, {
        requireTenant: true,
      }),
      async mutate(body, auth) {
        if (!auth) {
          return platformJsonError("unauthorized", "Authentication is required.", 401);
        }

        const bindingError = requireTenantScopedRecordBinding();
        if (bindingError) {
          return bindingError;
        }

        const { id } = await params;
        const parsedInput = endResourceMaintenanceInputSchema.safeParse(body);
        if (!parsedInput.success) {
          return platformJsonError(
            "validation_failed",
            "Invalid resource maintenance end request.",
            400,
            { issues: parsedInput.error.issues },
          );
        }

        const repository = createSupabaseResourceMaintenanceRepository(
          auth.supabase as unknown as SupabaseResourceMaintenanceRepositoryInput,
        );
        const result = await endResourceMaintenance({
          repository,
          maintenanceId: id,
          data: parsedInput.data,
        });

        return Response.json(result.body, { status: result.status });
      },
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return platformJsonError("validation_failed", "Invalid JSON body.", 400);
    }

    console.error("Failed to end platform resource maintenance:", error);
    return platformJsonError("internal_error", "Failed to end resource maintenance.", 500);
  }
}
