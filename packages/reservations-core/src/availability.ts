import { getCapacityResult } from "./capacity";
import {
  getReservationResourceLabels,
  getReservationsForSlot,
  naturalLabelSort,
  normalizeResourceLabels,
} from "./conflicts";
import type { Reservation, ReservationService, ReservationTimeSlot } from "./types";

export const DEFAULT_OPERATING_HOURS = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0] as const;

export function getEndTime(startTime: string) {
  const startHour = Number.parseInt(startTime.split(":")[0], 10);
  const endHour = (startHour + 1) % 24;
  return `${endHour.toString().padStart(2, "0")}:00`;
}

export interface GenerateAvailabilityOptions {
  operatingHours?: readonly number[];
  maintenanceResourceLabels?: string[];
  legacyFallbackLabels?: string[];
}

function getFallbackLabels(
  missingLabelCount: number,
  unavailableLabels: Set<string>,
  fallbackLabels: string[],
) {
  const labels: string[] = [];

  for (const fallbackLabel of fallbackLabels) {
    if (missingLabelCount <= 0) {
      break;
    }

    if (!unavailableLabels.has(fallbackLabel)) {
      labels.push(fallbackLabel);
      unavailableLabels.add(fallbackLabel);
      missingLabelCount -= 1;
    }
  }

  return labels;
}

export function getUnavailableResourceLabels(
  reservations: Pick<Reservation, "items" | "quantity" | "seat_labels">[],
  maintenanceResourceLabels: string[] = [],
  legacyFallbackLabels: string[] = [],
) {
  const unavailableLabels = new Set(normalizeResourceLabels(maintenanceResourceLabels));

  for (const reservation of reservations) {
    const explicitLabels = getReservationResourceLabels(reservation);
    explicitLabels.forEach((label) => unavailableLabels.add(label));

    const missingLabelCount = Math.max(0, reservation.quantity - explicitLabels.length);
    getFallbackLabels(missingLabelCount, unavailableLabels, legacyFallbackLabels);
  }

  return Array.from(unavailableLabels).sort(naturalLabelSort);
}

export function generateAvailabilityTimeSlots(
  service: Pick<ReservationService, "total_seats" | "policy" | "resources">,
  reservations: Reservation[],
  options: GenerateAvailabilityOptions = {},
): ReservationTimeSlot[] {
  const operatingHours = options.operatingHours ?? DEFAULT_OPERATING_HOURS;
  const maintenanceResourceLabels = normalizeResourceLabels(options.maintenanceResourceLabels ?? []);

  return operatingHours.map((hour) => {
    const startTime = `${hour.toString().padStart(2, "0")}:00`;
    const slotReservations = getReservationsForSlot(reservations, startTime);
    const unavailableResourceLabels = getUnavailableResourceLabels(
      slotReservations,
      maintenanceResourceLabels,
      options.legacyFallbackLabels ?? [],
    );
    const capacityResult = getCapacityResult(service, slotReservations, maintenanceResourceLabels);
    const unavailableQuantity = service.policy.kind === "capacity"
      ? capacityResult.unavailable_quantity
      : unavailableResourceLabels.length;
    const availableQuantity = Math.max(0, capacityResult.capacity - unavailableQuantity);

    return {
      start_time: startTime,
      end_time: getEndTime(startTime),
      available_quantity: availableQuantity,
      is_available: availableQuantity > 0,
      taken_resource_labels: unavailableResourceLabels,
      maintenance_resource_labels: maintenanceResourceLabels,
      available_seats: availableQuantity,
      taken_seat_labels: unavailableResourceLabels,
      ...(maintenanceResourceLabels.length > 0
        ? { maintenance_seat_labels: maintenanceResourceLabels }
        : {}),
    };
  });
}
