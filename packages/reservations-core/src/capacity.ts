import { getResourceCapacity, getServiceCapacity } from "./policies.js";
import type { Reservation, ReservationService, ReservableResource } from "./types.js";

export interface CapacityResult {
  capacity: number;
  booked_quantity: number;
  maintenance_quantity: number;
  unavailable_quantity: number;
  available_quantity: number;
}

export function getBookedQuantity(reservations: Pick<Reservation, "quantity">[]) {
  return reservations.reduce((sum, reservation) => sum + reservation.quantity, 0);
}

export function getMaintenanceQuantity(
  maintenanceResourceLabels: string[],
  resources: Pick<ReservableResource, "label" | "capacity">[] = [],
) {
  if (resources.length === 0) {
    return new Set(maintenanceResourceLabels).size;
  }

  const maintenanceLabels = new Set(maintenanceResourceLabels);

  return resources.reduce((sum, resource) => (
    maintenanceLabels.has(resource.label)
      ? sum + getResourceCapacity(resource)
      : sum
  ), 0);
}

export function getCapacityResult(
  service: Pick<ReservationService, "total_seats" | "policy" | "resources">,
  reservations: Pick<Reservation, "quantity">[],
  maintenanceResourceLabels: string[] = [],
) {
  const capacity = getServiceCapacity(service);
  const bookedQuantity = getBookedQuantity(reservations);
  const maintenanceQuantity = getMaintenanceQuantity(
    maintenanceResourceLabels,
    service.resources,
  );
  const unavailableQuantity = bookedQuantity + maintenanceQuantity;

  return {
    capacity,
    booked_quantity: bookedQuantity,
    maintenance_quantity: maintenanceQuantity,
    unavailable_quantity: unavailableQuantity,
    available_quantity: Math.max(0, capacity - unavailableQuantity),
  } satisfies CapacityResult;
}

export function isOverCapacity(
  service: Pick<ReservationService, "total_seats" | "policy" | "resources">,
  reservations: Pick<Reservation, "quantity">[],
  requestedQuantity: number,
  maintenanceResourceLabels: string[] = [],
) {
  return requestedQuantity > getCapacityResult(
    service,
    reservations,
    maintenanceResourceLabels,
  ).available_quantity;
}
