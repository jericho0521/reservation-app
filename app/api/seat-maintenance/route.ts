import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, requireAuthenticatedSupabase } from "@/app/api/api-utils";
import { normalizeSeatLabel, normalizeSeatLabels } from "@/lib/seat-maintenance";

const updateSeatMaintenanceSchema = z.object({
  service_id: z.string().uuid(),
  seat_labels: z.array(z.string()),
  reason: z.string().trim().optional(),
});

function getUserId(user: unknown) {
  return typeof user === "object" && user !== null && "id" in user
    ? String((user as { id: unknown }).id)
    : null;
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

    const { error: deactivateError } = await auth.supabase
      .from("service_seat_maintenance")
      .update({ is_active: false })
      .eq("service_id", payload.service_id)
      .eq("is_active", true);

    if (deactivateError) throw deactivateError;

    if (normalizedSeatLabels.length > 0) {
      const userId = getUserId(auth.user);
      const rows = normalizedSeatLabels.map((seatLabel) => ({
        service_id: payload.service_id,
        seat_label: seatLabel,
        reason: payload.reason || null,
        is_active: true,
        created_by: userId,
      }));

      const { error: upsertError } = await auth.supabase
        .from("service_seat_maintenance")
        .upsert(rows, { onConflict: "service_id,seat_label" });

      if (upsertError) throw upsertError;
    }

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
