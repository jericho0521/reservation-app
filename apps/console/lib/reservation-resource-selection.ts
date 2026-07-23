import type { AvailabilitySlot, ReservationItemInput, ResourceResponse, ServiceResponse } from "@reservation-platform/sdk";

export function requiresOwnerResourceSelection(service: Pick<ServiceResponse, "booking_mode" | "resource_kind" | "resource_strategy"> | undefined) {
  return Boolean(
    service
    && service.booking_mode !== "appointment"
    && (
      service.resource_kind === "room"
      || (service.resource_strategy !== undefined && service.resource_strategy !== "quantity")
    ),
  );
}

export function availabilitySlotSupportsResources(
  slot: Pick<AvailabilitySlot, "taken_resource_labels" | "maintenance_resource_labels">,
  resources: ResourceResponse[],
  resourceIds: string[],
) {
  const selectedIds = [...new Set(resourceIds.filter(Boolean))];
  if (selectedIds.length === 0) return true;

  const resourcesById = new Map(resources.map((resource) => [resource.resource_id, resource]));
  const selected = selectedIds.map((resourceId) => resourcesById.get(resourceId));
  if (selected.some((resource) => !resource || !resource.is_active)) return false;

  const unavailableLabels = new Set([
    ...(slot.taken_resource_labels ?? []),
    ...(slot.maintenance_resource_labels ?? []),
  ].map(normalizeResourceLabel));
  return (selected as ResourceResponse[]).every((resource) => (
    !unavailableLabels.has(normalizeResourceLabel(resource.label))
  ));
}

export function buildOwnerResourceAssignment(input: {
  service: ServiceResponse;
  resources: ResourceResponse[];
  resourceIds: string[];
  quantity: number;
}): { resource_ids: string[]; reservation_items: ReservationItemInput[] } {
  const resourceIds = [...new Set(input.resourceIds.filter(Boolean))];
  if (!requiresOwnerResourceSelection(input.service)) {
    return { resource_ids: [], reservation_items: [] };
  }
  if (resourceIds.length === 0) {
    throw new Error("Choose an available resource for this reservation.");
  }

  const resourcesById = new Map(input.resources.map((resource) => [resource.resource_id, resource]));
  const selected = resourceIds.map((resourceId) => resourcesById.get(resourceId));
  if (selected.some((resource) => (
    !resource
    || !resource.is_active
    || resource.service_id !== input.service.service_id
  ))) {
    throw new Error("One or more selected resources are unavailable for this service.");
  }

  const selectedResources = selected as ResourceResponse[];
  const requiresSingleResource = input.service.resource_strategy === "hybrid"
    || input.service.resource_kind === "room";
  if (requiresSingleResource && selectedResources.length !== 1) {
    throw new Error("Choose one resource that can hold the requested number of seats.");
  }

  const capacities = selectedResources.map((resource) => Math.max(1, resource.capacity ?? 1));
  const selectedCapacity = capacities.reduce((sum, capacity) => sum + capacity, 0);
  const allowsCapacitySurplus = requiresSingleResource || capacities.some((capacity) => capacity > 1);
  if (selectedCapacity < input.quantity || (!allowsCapacitySurplus && selectedCapacity !== input.quantity)) {
    throw new Error("The selected resources do not provide the requested seat quantity.");
  }

  let remaining = input.quantity;
  const reservationItems = selectedResources.flatMap((resource, index) => {
    if (remaining <= 0) return [];
    const quantity = Math.min(capacities[index] ?? 1, remaining);
    remaining -= quantity;
    return [{ resource_id: resource.resource_id, resource_label: resource.label, quantity }];
  });

  return { resource_ids: resourceIds, reservation_items: reservationItems };
}

function normalizeResourceLabel(value: string) {
  return value.trim().toLocaleLowerCase();
}
