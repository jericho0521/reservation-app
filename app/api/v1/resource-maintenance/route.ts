import {
  createResourceMaintenanceInputSchema,
} from "@reservation-platform/contract-types";
import {
  createResourceMaintenance,
  listResourceMaintenance,
} from "@reservation-platform/api";
import { createSupabaseResourceMaintenanceRepository } from "@project-play/reservations-supabase";
import {
  platformJsonError,
  requirePlatformAuthenticatedSupabase,
  requirePlatformAuthenticatedSupabaseWithTenantContext,
  requireTenantScopedRecordBinding,
  resolveBackendRuntimeIdempotencyRepository,
  runJsonMutationIdempotently,
} from "../route-utils";

function getUserId(user: unknown) {
  const id = typeof user === "object" && user !== null && "id" in user
    ? (user as { id: unknown }).id
    : null;

  return typeof id === "string" ? id : null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const serviceId = searchParams.get("service_id");
  if (!serviceId) {
    return platformJsonError("validation_failed", "service_id is required.", 400);
  }

  const auth = await requirePlatformAuthenticatedSupabase();

  if (auth instanceof Response) {
    return auth;
  }

  const repository = createSupabaseResourceMaintenanceRepository(auth.context.supabase);
  const result = await listResourceMaintenance({ repository, serviceId });
  return Response.json(result.body, { status: result.status });
}

export async function POST(request: Request) {
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

        const parsedInput = createResourceMaintenanceInputSchema.safeParse(body);
        if (!parsedInput.success) {
          return platformJsonError(
            "validation_failed",
            "Invalid resource maintenance data.",
            400,
            { issues: parsedInput.error.issues },
          );
        }

        const repository = createSupabaseResourceMaintenanceRepository(auth.supabase);
        const result = await createResourceMaintenance({
          repository,
          data: parsedInput.data,
          userId: getUserId(auth.user),
        });

        return Response.json(result.body, { status: result.status });
      },
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return platformJsonError("validation_failed", "Invalid JSON body.", 400);
    }

    console.error("Failed to create platform resource maintenance:", error);
    return platformJsonError("internal_error", "Failed to create resource maintenance.", 500);
  }
}
