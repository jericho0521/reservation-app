import type { ReservationResponse } from "@reservation-platform/sdk";

export const appointmentStatuses = ["pending", "confirmed", "completed", "cancelled", "no_show"] as const;
export type AppointmentStatus = typeof appointmentStatuses[number];

const transitions: Record<AppointmentStatus, readonly AppointmentStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["completed", "no_show", "cancelled"],
  completed: [],
  cancelled: [],
  no_show: [],
};

export interface AppointmentFilters {
  date: string;
  venueId?: string;
  practitionerId?: string;
  status?: string;
  search?: string;
  channel?: string;
  serviceId?: string;
  authorizedVenueIds: readonly string[];
}

export function isAppointmentStatus(value: string): value is AppointmentStatus {
  return appointmentStatuses.some((status) => status === value);
}

export function canTransition(current: string, next: string): boolean {
  return isAppointmentStatus(current)
    && isAppointmentStatus(next)
    && transitions[current].includes(next);
}

export function allowedAppointmentTransitions(current: string): readonly AppointmentStatus[] {
  return isAppointmentStatus(current) ? transitions[current] : [];
}

export function transitionReasonRequired(next: string): boolean {
  return next === "cancelled" || next === "no_show";
}

export function validateAppointmentTransition(current: string, next: string, reason: string): string | undefined {
  if (!canTransition(current, next)) return `The appointment cannot move from ${statusLabel(current)} to ${statusLabel(next)}.`;
  if (transitionReasonRequired(next) && !reason.trim()) return "An audit reason is required for this status change.";
  return undefined;
}

export function filterAppointments(reservations: readonly ReservationResponse[], filters: AppointmentFilters): ReservationResponse[] {
  const authorized = new Set(filters.authorizedVenueIds);
  if (filters.venueId && !authorized.has(filters.venueId)) return [];
  const search = filters.search?.trim().toLocaleLowerCase();
  return reservations.filter((reservation) => {
    if (reservation.venue_id && !authorized.has(reservation.venue_id)) return false;
    if (filters.venueId && reservation.venue_id !== filters.venueId) return false;
    if (reservation.date !== filters.date) return false;
    if (filters.practitionerId && reservation.staff_id !== filters.practitionerId) return false;
    if (filters.status && reservation.status !== filters.status) return false;
    if (filters.channel && reservation.metadata?.channel_origin !== filters.channel) return false;
    if (filters.serviceId && reservation.service_id !== filters.serviceId) return false;
    if (search && ![
      reservation.customer?.name,
      reservation.customer?.email,
      reservation.customer?.phone,
      reservation.metadata?.service_name,
      reservation.reservation_id,
    ].some((value) => String(value ?? "").toLocaleLowerCase().includes(search))) return false;
    return true;
  }).sort((left, right) => `${left.start_time ?? ""}:${left.reservation_id}`.localeCompare(`${right.start_time ?? ""}:${right.reservation_id}`));
}

export function nextAppointmentDate(date: string, offsetDays: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(value.valueOf())) return date;
  value.setUTCDate(value.getUTCDate() + offsetDays);
  return value.toISOString().slice(0, 10);
}

export function statusLabel(status: string): string {
  return status === "no_show" ? "No-show" : `${status[0]?.toUpperCase() ?? ""}${status.slice(1)}`;
}
