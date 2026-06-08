import type {
  ReservationPolicy,
  ReservationService,
  ReservableResource,
} from "./types.js";

export function getServiceCapacity(
  service: Pick<ReservationService, "total_seats" | "policy" | "resources">,
) {
  if (service.policy.kind === "capacity") {
    return service.policy.max_quantity;
  }

  const activeResourceCapacity = (service.resources ?? [])
    .filter((resource) => resource.is_active)
    .reduce((sum, resource) => sum + getResourceCapacity(resource), 0);

  return activeResourceCapacity || service.policy.max_quantity || service.total_seats;
}

export function getResourceCapacity(resource: Pick<ReservableResource, "capacity">) {
  return Math.max(1, resource.capacity ?? 1);
}

export function requiresAssignedResources(policy: ReservationPolicy) {
  return policy.selection_mode === "assigned_resource" || policy.require_resource_labels;
}
