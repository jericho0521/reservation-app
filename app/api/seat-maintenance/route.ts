import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, requireAuthenticatedSupabase, supabaseErrorStatus } from "@/app/api/api-utils";
import { normalizeResourceLabels, normalizeSeatLabel, normalizeSeatLabels } from "@/lib/seat-maintenance";
import type { ReservationPolicy, ResourceSelectionMode } from "@/types";

const RACING_SIMULATOR_SEAT_COUNT = 16;

const updateSeatMaintenanceSchema = z.object({
  service_id: z.string().uuid(),
  seat_labels: z.array(z.string()),
  reason: z.string().trim().optional(),
});

export function isSeatMaintenanceSupportedService(service: { total_seats: number } | null | undefined) {
  return service?.total_seats === RACING_SIMULATOR_SEAT_COUNT;
}

interface MaintenanceServiceMetadata {
  total_seats: number;
  selection_mode?: ResourceSelectionMode | null;
  reservation_policy?: ReservationPolicy | null;
  resources?: Array<{ label: string | null; is_active: boolean | null }> | null;
}

export function isResourceMaintenanceSupportedService(
  service: MaintenanceServiceMetadata | null | undefined,
) {
  if (!service) {
    return false;
  }

  return Boolean(
    service.selection_mode === "assigned_resource" ||
    service.reservation_policy?.require_resource_labels === true ||
    service.resources?.some((resource) => resource.is_active !== false),
  );
}

function getConfiguredResourceLabels(service: MaintenanceServiceMetadata) {
  return normalizeResourceLabels(
    (service.resources ?? [])
      .filter((resource) => resource.is_active !== false)
      .map((resource) => resource.label ?? ""),
  );
}

function isRacingSeatLabelSet(labels: string[]) {
  if (labels.length !== RACING_SIMULATOR_SEAT_COUNT) {
    return false;
  }

  const labelSet = new Set(labels);
  return Array.from({ length: RACING_SIMULATOR_SEAT_COUNT }, (_, index) => `RS${index + 1}`)
    .every((label) => labelSet.has(label));
}

function shouldUseLegacyRacingSeatNormalization(service: MaintenanceServiceMetadata) {
  const configuredLabels = getConfiguredResourceLabels(service);

  return configuredLabels.length > 0
    ? isRacingSeatLabelSet(configuredLabels)
    : isSeatMaintenanceSupportedService(service);
}

export function normalizeMaintenanceResourceLabels(
  labels: string[],
  service: MaintenanceServiceMetadata,
) {
  if (shouldUseLegacyRacingSeatNormalization(service)) {
    const normalizedSeatLabels = normalizeSeatLabels(labels);
    const hasInvalidSeatLabel = labels.some((label) => normalizeSeatLabel(label) === null);

    return {
      labels: normalizedSeatLabels,
      isValid: !hasInvalidSeatLabel,
    };
  }

  const normalizedLabels = normalizeResourceLabels(labels);
  const hasBlankLabel = labels.some((label) => label.trim().length === 0);
  const configuredLabels = getConfiguredResourceLabels(service);

  if (configuredLabels.length === 0) {
    return {
      labels: normalizedLabels,
      isValid: !hasBlankLabel,
    };
  }

  const configuredLabelSet = new Set(configuredLabels.map((label) => label.toLocaleLowerCase()));
  const isWithinConfiguredResources = normalizedLabels.every((label) =>
    configuredLabelSet.has(label.toLocaleLowerCase())
  );

  return {
    labels: normalizedLabels,
    isValid: !hasBlankLabel && isWithinConfiguredResources,
  };
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

    const { data: service, error: serviceError } = await auth.supabase
      .from("services")
      .select("total_seats, selection_mode, reservation_policy, resources:reservable_resources(label, is_active)")
      .eq("id", payload.service_id)
      .single();

    if (serviceError) {
      return jsonError(
        supabaseErrorStatus(serviceError) === 404 ? "Service not found" : "Failed to load service",
        supabaseErrorStatus(serviceError),
      );
    }

    if (!shouldUseLegacyRacingSeatNormalization(service) && !isResourceMaintenanceSupportedService(service)) {
      return jsonError("Resource maintenance is only available for assigned-resource services", 400);
    }

    const normalizedResources = normalizeMaintenanceResourceLabels(payload.seat_labels, service);

    if (!normalizedResources.isValid) {
      return jsonError("Invalid resource labels", 400);
    }

    const { error: replaceError } = await auth.supabase.rpc("replace_service_seat_maintenance", {
      p_service_id: payload.service_id,
      p_seat_labels: normalizedResources.labels,
      p_reason: payload.reason || null,
      p_created_by: getUserId(auth.user),
    });

    if (replaceError) throw replaceError;

    return NextResponse.json({ seat_labels: normalizedResources.labels });
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
