import { getCapacityResult } from "./capacity.js";
import {
  getReservationResourceLabels,
  getReservationsForSlot,
  hasAppointmentConflict,
  naturalLabelSort,
  normalizeResourceLabels,
} from "./conflicts.js";
import type { Reservation, ReservationService, ReservationTimeSlot } from "./types.js";

export const DEFAULT_OPERATING_HOURS = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0] as const;

export function getEndTime(startTime: string) {
  const startHour = Number.parseInt(startTime.split(":")[0], 10);
  const endHour = (startHour + 1) % 24;
  return `${endHour.toString().padStart(2, "0")}:00`;
}

export interface GenerateAvailabilityOptions {
  operatingHours?: readonly number[];
  operatingWindows?: ReadonlyArray<{
    start_time: string;
    end_time: string;
    interval_minutes: number;
  }>;
  durationMinutes?: number;
  maintenanceResourceLabels?: string[];
  legacyFallbackLabels?: string[];
  staffId?: string;
  bufferBeforeMinutes?: number;
  bufferAfterMinutes?: number;
  staffUnavailable?: boolean;
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
  const slotTimes = options.operatingWindows
    ? generateWindowSlotTimes(options.operatingWindows, options.durationMinutes ?? 60)
    : (options.operatingHours ?? DEFAULT_OPERATING_HOURS).map((hour) => {
        const startTime = `${hour.toString().padStart(2, "0")}:00`;
        return { startTime, endTime: getEndTime(startTime) };
      });
  const maintenanceResourceLabels = normalizeResourceLabels(options.maintenanceResourceLabels ?? []);

  return slotTimes.map(({ startTime, endTime }) => {
    const slotReservations = options.staffId
      ? reservations.filter((reservation) => hasAppointmentConflict({
          start_time: startTime,
          end_time: endTime,
          staff_id: options.staffId,
          buffer_before_minutes: options.bufferBeforeMinutes,
          buffer_after_minutes: options.bufferAfterMinutes,
        }, [{
          ...reservation,
          buffer_before_minutes: options.bufferBeforeMinutes,
          buffer_after_minutes: options.bufferAfterMinutes,
        }]))
      : getReservationsForSlot(reservations, startTime, endTime);
    const unavailableResourceLabels = getUnavailableResourceLabels(
      slotReservations,
      maintenanceResourceLabels,
      options.legacyFallbackLabels ?? [],
    );
    const capacityResult = getCapacityResult(service, slotReservations, maintenanceResourceLabels);
    const hasVariableResourceCapacity = (service.resources ?? [])
      .some((resource) => (resource.capacity ?? 1) > 1);
    const unavailableQuantity = service.policy.kind === "capacity" || hasVariableResourceCapacity
      ? capacityResult.unavailable_quantity
      : unavailableResourceLabels.length;
    const availableQuantity = options.staffId
      ? (slotReservations.length === 0 && !options.staffUnavailable ? 1 : 0)
      : Math.max(0, capacityResult.capacity - unavailableQuantity);

    return {
      start_time: startTime,
      end_time: endTime,
      available_quantity: availableQuantity,
      is_available: availableQuantity > 0,
      taken_resource_labels: unavailableResourceLabels,
      maintenance_resource_labels: maintenanceResourceLabels,
      ...(options.staffId ? { staff_id: options.staffId } : {}),
      available_seats: availableQuantity,
      taken_seat_labels: unavailableResourceLabels,
      ...(maintenanceResourceLabels.length > 0
        ? { maintenance_seat_labels: maintenanceResourceLabels }
        : {}),
    };
  });
}

function generateWindowSlotTimes(
  windows: ReadonlyArray<{ start_time: string; end_time: string; interval_minutes: number }>,
  durationMinutes: number,
) {
  const slots = new Map<string, { startTime: string; endTime: string }>();
  for (const window of windows) {
    const start = timeToMinutes(window.start_time);
    const end = timeToMinutes(window.end_time);
    if (start === null || end === null || start >= end || window.interval_minutes <= 0 || durationMinutes <= 0) {
      continue;
    }
    for (let minute = start; minute + durationMinutes <= end; minute += window.interval_minutes) {
      const startTime = minutesToTime(minute);
      slots.set(startTime, { startTime, endTime: minutesToTime(minute + durationMinutes) });
    }
  }
  return [...slots.values()].sort((left, right) => left.startTime.localeCompare(right.startTime));
}

function timeToMinutes(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : null;
}

function minutesToTime(value: number) {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}
