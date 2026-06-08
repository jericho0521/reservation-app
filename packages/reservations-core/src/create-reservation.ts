import { getCapacityResult } from "./capacity";
import { getUnavailableResourceLabels } from "./availability";
import {
  getConflictingResourceLabels,
  getMaintenanceResourceConflicts,
} from "./conflicts";
import { getServiceCapacity, requiresAssignedResources } from "./policies";
import type { Reservation, ReservationService } from "./types";

export interface ReservationValidationResult {
  ok: boolean;
  error?: "not_enough_capacity" | "maintenance_conflict" | "resource_conflict" | "missing_resource_labels";
  available_quantity?: number;
  conflicting_resource_labels?: string[];
}

export function validateReservationRequest(
  service: Pick<ReservationService, "total_seats" | "policy" | "resources">,
  existingReservations: Reservation[],
  requestedReservation: Reservation,
  maintenanceResourceLabels: string[] = [],
): ReservationValidationResult {
  const requestedResourceLabels = requestedReservation.items
    .map((item) => item.resource_label)
    .filter((label): label is string => typeof label === "string");

  if (
    requiresAssignedResources(service.policy) &&
    requestedResourceLabels.length !== requestedReservation.quantity
  ) {
    return { ok: false, error: "missing_resource_labels" };
  }

  const maintenanceConflicts = getMaintenanceResourceConflicts(
    requestedResourceLabels,
    maintenanceResourceLabels,
  );

  if (maintenanceConflicts.length > 0) {
    return {
      ok: false,
      error: "maintenance_conflict",
      conflicting_resource_labels: maintenanceConflicts,
    };
  }

  const resourceConflicts = getConflictingResourceLabels(
    existingReservations,
    requestedResourceLabels,
  );

  if (resourceConflicts.length > 0) {
    return {
      ok: false,
      error: "resource_conflict",
      conflicting_resource_labels: resourceConflicts,
    };
  }

  const availableQuantity = service.policy.kind === "capacity"
    ? getCapacityResult(
        service,
        existingReservations,
        maintenanceResourceLabels,
      ).available_quantity
    : Math.max(
        0,
        getServiceCapacity(service) - getUnavailableResourceLabels(
          existingReservations,
          maintenanceResourceLabels,
        ).length,
      );

  if (requestedReservation.quantity > availableQuantity) {
    return {
      ok: false,
      error: "not_enough_capacity",
      available_quantity: availableQuantity,
    };
  }

  return { ok: true };
}
