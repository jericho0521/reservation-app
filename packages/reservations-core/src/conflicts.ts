import type { Reservation } from "./types.js";

export interface ResourceReservationLike {
  start_time: string;
  end_time?: string;
  quantity: number;
  resource_labels?: string[] | null;
}

export interface AppointmentReservationLike {
  booking_date?: string;
  start_time: string;
  end_time: string;
  staff_id?: string;
  buffer_before_minutes?: number;
  buffer_after_minutes?: number;
}

export function hasAppointmentConflict(
  requested: AppointmentReservationLike,
  existingReservations: AppointmentReservationLike[],
) {
  if (!requested.staff_id) return false;
  const requestedStart = timeToMinutes(requested.start_time) - (requested.buffer_before_minutes ?? 0);
  const requestedEnd = timeToMinutes(requested.end_time) + (requested.buffer_after_minutes ?? 0);

  return existingReservations.some((existing) => {
    if (existing.staff_id !== requested.staff_id) return false;
    if (requested.booking_date && existing.booking_date && requested.booking_date !== existing.booking_date) return false;
    const existingStart = timeToMinutes(existing.start_time) - (existing.buffer_before_minutes ?? 0);
    const existingEnd = timeToMinutes(existing.end_time) + (existing.buffer_after_minutes ?? 0);
    return existingStart < requestedEnd && existingEnd > requestedStart;
  });
}

function timeToMinutes(value: string) {
  const [hours, minutes] = normalizeSlotTime(value).split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
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
