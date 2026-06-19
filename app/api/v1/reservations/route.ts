import { NextRequest, NextResponse } from "next/server";
import {
  prepareLegacyReservationCreate,
  prepareReservationCreateInput,
  platformErrorBody,
} from "@reservation-platform/api";
import {
  platformJsonError,
  resolveBackendRuntimeIdempotencyRepository,
  runJsonMutationIdempotently,
} from "../route-utils";
import { resolveResourceIdsForLegacyReservation } from "../reservation-resource-labels";
import { createLegacyReservationResponse } from "../reservation-create-compatibility";
import { listLegacyCompatibleReservations } from "../reservation-list-compatibility";

export async function GET(request: NextRequest) {
  return listLegacyCompatibleReservations(request);
}

export async function POST(request: Request) {
  try {
    return runJsonMutationIdempotently({
      request,
      repository: resolveBackendRuntimeIdempotencyRepository,
      async mutate(body) {
        const preparedInput = prepareReservationCreateInput(body);
        if (preparedInput.status !== 200) {
          return NextResponse.json(preparedInput.error, { status: preparedInput.status });
        }

        const resolvedInput = await resolveResourceIdsForLegacyReservation(preparedInput.input);
        const preparedLegacy = prepareLegacyReservationCreate(resolvedInput);
        return createLegacyReservationResponse(preparedLegacy.legacyInput);
      },
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return platformJsonError("validation_failed", "Invalid JSON body.", 400);
    }
    console.error("Failed to create platform reservation:", error);
    return Response.json(
      platformErrorBody("internal_error", "Failed to create reservation.", 500),
      { status: 500 },
    );
  }
}
