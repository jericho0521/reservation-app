import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, requireAuthenticatedSupabase, supabaseErrorStatus } from "@/app/api/api-utils";
import { normalizeSeatLabel, normalizeSeatLabels } from "@/lib/seat-maintenance";

const RACING_SIMULATOR_SEAT_COUNT = 16;

const updateSeatMaintenanceSchema = z.object({
  service_id: z.string().uuid(),
  seat_labels: z.array(z.string()),
  reason: z.string().trim().optional(),
});

export function isSeatMaintenanceSupportedService(service: { total_seats: number } | null | undefined) {
  return service?.total_seats === RACING_SIMULATOR_SEAT_COUNT;
}

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
    return jsonError("service_id is required", 400);
  }

  const auth = await requireAuthenticatedSupabase();

  if (auth.response) {
    return auth.response;
  }

  const { data, error } = await auth.supabase
    .from("service_seat_maintenance")
    .select("id, service_id, seat_label, reason, is_active, updated_at")
    .eq("service_id", serviceId)
    .eq("is_active", true)
    .order("seat_label");

  if (error) {
    console.error("Failed to load seat maintenance:", error);
    return jsonError("Failed to load seat maintenance", 500);
  }

  return NextResponse.json({ seats: data ?? [] });
}

export async function PUT(request: Request) {
  try {
    const auth = await requireAuthenticatedSupabase();

    if (auth.response) {
      return auth.response;
    }

    const payload = updateSeatMaintenanceSchema.parse(await request.json());
    const normalizedSeatLabels = normalizeSeatLabels(payload.seat_labels);

    if (payload.seat_labels.some((label) => normalizeSeatLabel(label) === null)) {
      return jsonError("Invalid seat labels", 400);
    }

    const { data: service, error: serviceError } = await auth.supabase
      .from("services")
      .select("total_seats")
      .eq("id", payload.service_id)
      .single();

    if (serviceError) {
      return jsonError(
        supabaseErrorStatus(serviceError) === 404 ? "Service not found" : "Failed to load service",
        supabaseErrorStatus(serviceError),
      );
    }

    if (!isSeatMaintenanceSupportedService(service)) {
      return jsonError("Seat maintenance is only available for racing simulator services", 400);
    }

    const { error: replaceError } = await auth.supabase.rpc("replace_service_seat_maintenance", {
      p_service_id: payload.service_id,
      p_seat_labels: normalizedSeatLabels,
      p_reason: payload.reason || null,
      p_created_by: getUserId(auth.user),
    });

    if (replaceError) throw replaceError;

    return NextResponse.json({ seat_labels: normalizedSeatLabels });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError("Invalid seat maintenance data", 400, { details: error.issues });
    }

    if (error instanceof SyntaxError) {
      return jsonError("Invalid JSON body", 400);
    }

    console.error("Failed to update seat maintenance:", error);
    return jsonError("Failed to update seat maintenance", 500);
  }
}
