import {
  platformJsonError,
  requirePlatformAuthenticatedSupabaseWithTenantContext,
  requireTenantScopedRecordBinding,
  resolveBackendRuntimeIdempotencyRepository,
  runJsonMutationIdempotently,
} from "../../../route-utils";
import {
  prepareLegacyReservationReschedule,
  prepareReservationRescheduleInput,
} from "@reservation-platform/api";
import { resolveResourceIdsForLegacyReservation } from "../../../reservation-resource-labels";
import { rescheduleLegacyCompatibleReservation } from "../../../reservation-update-compatibility";

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
        const preparedInput = prepareReservationRescheduleInput(body);
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

        const legacyInput = await resolveResourceIdsForLegacyReservation(preparedInput.input);
        const preparedLegacy = prepareLegacyReservationReschedule(legacyInput);
        return rescheduleLegacyCompatibleReservation(
          context,
          preparedLegacy.legacyInput,
          auth,
        );
      },
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return platformJsonError("validation_failed", "Invalid JSON body.", 400);
    }
    console.error("Failed to reschedule platform reservation:", error);
    return platformJsonError("internal_error", "Failed to reschedule reservation.", 500);
  }
}
