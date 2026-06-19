import {
  platformJsonError,
  requirePlatformAuthenticatedSupabaseWithTenantContext,
  requireTenantScopedRecordBinding,
  resolveBackendRuntimeIdempotencyRepository,
  runJsonMutationIdempotently,
} from "../../../route-utils";
import { prepareReservationCancelInput } from "@reservation-platform/api";
import { cancelLegacyCompatibleReservation } from "../../../reservation-cancel-compatibility";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    return runJsonMutationIdempotently({
      request,
      repository: resolveBackendRuntimeIdempotencyRepository,
      beforeIdempotency: () => requirePlatformAuthenticatedSupabaseWithTenantContext(request, {
        requireTenant: true,
      }),
      async mutate(body, auth) {
        const preparedInput = prepareReservationCancelInput(body);
        if (preparedInput.status !== 200) {
          return Response.json(preparedInput.error, { status: preparedInput.status });
        }

        if (!auth) {
          return platformJsonError("unauthorized", "Authentication is required.", 401);
        }

        const bindingError = requireTenantScopedRecordBinding();
        if (bindingError) {
          return bindingError;
        }

        return cancelLegacyCompatibleReservation(context, auth);
      },
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return platformJsonError("validation_failed", "Invalid JSON body.", 400);
    }
    console.error("Failed to cancel platform reservation:", error);
    return platformJsonError("internal_error", "Failed to cancel reservation.", 500);
  }
}
