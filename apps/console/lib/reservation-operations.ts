import type { ReservationResponse, ResourceResponse } from "@reservation-platform/sdk";

export interface ReservationFilters { search?: string; status?: string; channel?: string; serviceId?: string }

export function filterReservations(reservations: ReservationResponse[], filters: ReservationFilters) {
  const search = filters.search?.trim().toLocaleLowerCase();
  return reservations.filter((reservation) => {
    const matchesSearch = !search || [reservation.customer?.name, reservation.customer?.email, reservation.customer?.phone, reservation.metadata?.service_name, reservation.reservation_id].some((value) => String(value ?? "").toLocaleLowerCase().includes(search));
    const matchesStatus = !filters.status || reservation.status === filters.status;
    const matchesChannel = !filters.channel || reservation.metadata?.channel_origin === filters.channel;
    const matchesService = !filters.serviceId || reservation.service_id === filters.serviceId;
    return matchesSearch && matchesStatus && matchesChannel && matchesService;
  });
}

export function futureReservationWarnings(resource: ResourceResponse, reservations: ReservationResponse[], today: string) {
  return reservations.filter((reservation) => reservation.status === "confirmed" && (reservation.date ?? "") >= today && reservation.reservation_items?.some((item) => item.resource_id === resource.resource_id || item.resource_label === resource.label));
}

export function reservationChannel(reservation: ReservationResponse) {
  const channel = reservation.metadata?.channel_origin;
  return channel === "web_chat" ? "Web chat" : channel === "whatsapp" ? "WhatsApp" : channel === "simulation" ? "Simulation" : "Web booking";
}
