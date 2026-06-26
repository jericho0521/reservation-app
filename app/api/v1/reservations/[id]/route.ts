import {
  platformJsonError,
  requirePlatformAuthenticatedSupabaseWithTenantContext,
  requireTenantScopedRecordBinding,
  resolveBackendRuntimeIdempotencyRepository,
  runJsonMutationIdempotently,
} from "../../route-utils";
import {
  prepareReservationCancelInput,
  prepareReservationUpdatePatch,
} from "@reservation-platform/api";
import { cancelLegacyCompatibleReservation } from "../../reservation-cancel-compatibility";
import { readLegacyCompatibleReservation } from "../../reservation-read-compatibility";
import { updateLegacyCompatibleReservation } from "../../reservation-update-compatibility";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return readLegacyCompatibleReservation(request, context);
}

export async function PATCH(
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
        const preparedPatch = prepareReservationUpdatePatch(body);
        if ("error" in preparedPatch) {
          return Response.json(preparedPatch.error, { status: preparedPatch.status });
        }

        if (!auth) {
          return platformJsonError("unauthorized", "Authentication is required.", 401);
        }

        const bindingError = requireTenantScopedRecordBinding();
        if (bindingError) {
          return bindingError;
        }

        return updateLegacyCompatibleReservation(
          context,
          preparedPatch.legacyPatch,
          auth,
        );
      },
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return platformJsonError("validation_failed", "Invalid JSON body.", 400);
    }
    console.error("Failed to update platform reservation:", error);
    return platformJsonError("internal_error", "Failed to update reservation.", 500);
  }
}

export async function DELETE(
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
