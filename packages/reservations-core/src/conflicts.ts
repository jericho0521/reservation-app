import type { Reservation } from "./types.js";

export interface ResourceReservationLike {
  start_time: string;
  end_time?: string;
  quantity: number;
  resource_labels?: string[] | null;
}

export function normalizeSlotTime(time: string) {
  return time.slice(0, 5);
}

export function getReservationsForSlot<T extends Pick<ResourceReservationLike, "start_time" | "end_time">>(
  reservations: T[],
  startTime: string,
  endTime?: string,
) {
  const normalizedStartTime = normalizeSlotTime(startTime);
  const normalizedEndTime = endTime ? normalizeSlotTime(endTime) : undefined;

  return reservations.filter((reservation) => {
    const reservationStart = normalizeSlotTime(reservation.start_time);
    const reservationEnd = reservation.end_time ? normalizeSlotTime(reservation.end_time) : undefined;
    return normalizedEndTime && reservationEnd
      ? reservationStart < normalizedEndTime && reservationEnd > normalizedStartTime
      : reservationStart === normalizedStartTime;
  });
}

export function normalizeResourceLabel(label: string) {
  const trimmedLabel = label.trim();
  return trimmedLabel.length > 0 ? trimmedLabel : null;
}

export function normalizeResourceLabels(labels: string[]) {
  return Array.from(new Set(
    labels
      .map((label) => normalizeResourceLabel(label))
      .filter((label): label is string => label !== null),
  )).sort(naturalLabelSort);
}

export function naturalLabelSort(left: string, right: string) {
  return left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

export function getReservationResourceLabels(
  reservation: Pick<Reservation, "items" | "seat_labels">,
) {
  const itemLabels = reservation.items
    .map((item) => item.resource_label)
    .filter((label): label is string => typeof label === "string");

  return normalizeResourceLabels([...itemLabels, ...reservation.seat_labels]);
}

export function getBookedResourceLabels(
  reservations: Pick<Reservation, "items" | "seat_labels">[],
) {
  return new Set(reservations.flatMap((reservation) => getReservationResourceLabels(reservation)));
}

export function getConflictingResourceLabels(
  reservations: Pick<Reservation, "items" | "seat_labels">[],
  requestedResourceLabels: string[],
) {
  const bookedResourceLabels = getBookedResourceLabels(reservations);

  return normalizeResourceLabels(requestedResourceLabels)
    .filter((label) => bookedResourceLabels.has(label));
}

export function getMaintenanceResourceConflicts(
  requestedResourceLabels: string[],
  maintenanceResourceLabels: string[],
) {
  const maintenanceResources = new Set(normalizeResourceLabels(maintenanceResourceLabels));

  return normalizeResourceLabels(requestedResourceLabels)
    .filter((label) => maintenanceResources.has(label));
}
