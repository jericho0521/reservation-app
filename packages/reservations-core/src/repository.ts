import type { Reservation, ReservationService } from "./types.js";

export interface ReservationLookup {
  serviceId: string;
  bookingDate: string;
}

export interface CreateReservationInput {
  service: ReservationService;
  reservation: Reservation;
  existingReservations: Reservation[];
  maintenanceResourceLabels?: string[];
}

export interface ReservationRepository {
  getService(serviceId: string): Promise<ReservationService | null>;
  getConfirmedReservations(lookup: ReservationLookup): Promise<Reservation[]>;
  getMaintenanceResourceLabels(serviceId: string): Promise<string[]>;
  createReservation(input: Reservation): Promise<Reservation>;
}

export interface AtomicReservationRepository extends ReservationRepository {
  createReservationAtomically(input: CreateReservationInput): Promise<Reservation>;
}
