import {
  generateAvailabilityTimeSlots,
  validateReservationRequest,
  type Reservation,
  type ReservationService,
} from "../src/index";

export interface ExampleAvailabilityResult {
  service: ReservationService;
  slots: ReturnType<typeof generateAvailabilityTimeSlots>;
}

export function getExampleAvailability(
  service: ReservationService,
  existingReservations: Reservation[],
): ExampleAvailabilityResult {
  return {
    service,
    slots: generateAvailabilityTimeSlots(service, existingReservations),
  };
}

export function validateExampleBooking(
  service: ReservationService,
  existingReservations: Reservation[],
  requestedReservation: Reservation,
  maintenanceResourceLabels: string[] = [],
) {
  return validateReservationRequest(
    service,
    existingReservations,
    requestedReservation,
    maintenanceResourceLabels,
  );
}
