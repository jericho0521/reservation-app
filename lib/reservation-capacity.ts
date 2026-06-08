import {
  getBookedQuantity,
  getCapacityResult,
  isOverCapacity as isReservationOverCapacity,
} from "./reservations/capacity";
import {
  getBookedResourceLabels,
  getConflictingResourceLabels as getReservationConflictingResourceLabels,
  getReservationsForSlot,
  normalizeSlotTime,
} from "./reservations/conflicts";
import { adaptLegacyBooking, createCapacityPolicy } from "./reservations/types";
import { normalizeSeatLabels } from "./seat-maintenance";

export interface SeatBooking {
  seats_booked: number;
}

export interface SlotSeatBooking extends SeatBooking {
  start_time: string;
  seat_labels?: string[] | null;
}

export { normalizeSlotTime };

export function getBookingsForSlot<T extends SlotSeatBooking>(
  bookings: T[],
  startTime: string,
) {
  return getReservationsForSlot(bookings, startTime);
}

export function getBookedSeatLabels(bookings: Pick<SlotSeatBooking, "seat_labels">[]) {
  return getBookedResourceLabels(bookings.map((booking, index) => adaptLegacyBooking({
    id: `legacy-booking-${index}`,
    service_id: "legacy",
    user_name: "",
    user_email: "",
    booking_date: "",
    start_time: "00:00",
    end_time: "01:00",
    seats_booked: Array.isArray(booking.seat_labels) ? booking.seat_labels.length : 0,
    seat_labels: Array.isArray(booking.seat_labels)
      ? booking.seat_labels.filter((label): label is string => typeof label === "string")
      : [],
    interface_type: "form",
  })));
}

export function getConflictingSeatLabels(
  bookings: Pick<SlotSeatBooking, "seat_labels">[],
  requestedSeatLabels: string[],
) {
  return getReservationConflictingResourceLabels(
    bookings.map((booking, index) => adaptLegacyBooking({
      id: `legacy-booking-${index}`,
      service_id: "legacy",
      user_name: "",
      user_email: "",
      booking_date: "",
      start_time: "00:00",
      end_time: "01:00",
      seats_booked: Array.isArray(booking.seat_labels) ? booking.seat_labels.length : 0,
      seat_labels: Array.isArray(booking.seat_labels)
        ? booking.seat_labels.filter((label): label is string => typeof label === "string")
        : [],
      interface_type: "form",
    })),
    requestedSeatLabels,
  );
}

export function getBookedSeats(bookings: SeatBooking[]) {
  return getBookedQuantity(bookings.map((booking) => ({
    quantity: booking.seats_booked,
  })));
}

export function getAvailableSeats(totalSeats: number, bookings: SeatBooking[]) {
  return getCapacityResult(
    {
      total_seats: totalSeats,
      policy: createCapacityPolicy(totalSeats),
    },
    bookings.map((booking) => ({
      quantity: booking.seats_booked,
    })),
  ).available_quantity;
}

function getFallbackSeatLabel(seatNumber: number) {
  return `RS${seatNumber}`;
}

function getUnavailableSeatLabels(
  totalSeats: number,
  bookings: Pick<SlotSeatBooking, "seats_booked" | "seat_labels">[],
  maintenanceSeatLabels: string[],
) {
  const labels = new Set(normalizeSeatLabels(maintenanceSeatLabels));

  for (const booking of bookings) {
    const explicitLabels = normalizeSeatLabels(
      Array.isArray(booking.seat_labels)
        ? booking.seat_labels.filter((label): label is string => typeof label === "string")
        : [],
    );
    let missingLabelCount = Math.max(0, booking.seats_booked - explicitLabels.length);

    explicitLabels.forEach((label) => labels.add(label));

    for (let seatNumber = totalSeats; seatNumber >= 1 && missingLabelCount > 0; seatNumber -= 1) {
      const fallbackLabel = getFallbackSeatLabel(seatNumber);

      if (!labels.has(fallbackLabel)) {
        labels.add(fallbackLabel);
        missingLabelCount -= 1;
      }
    }
  }

  return labels;
}

export function getAvailableSeatsWithMaintenance(
  totalSeats: number,
  bookings: Pick<SlotSeatBooking, "seats_booked" | "seat_labels">[],
  maintenanceSeatLabels: string[],
) {
  return Math.max(0, totalSeats - getUnavailableSeatLabels(
    totalSeats,
    bookings,
    maintenanceSeatLabels,
  ).size);
}

export function isOverCapacity(totalSeats: number, bookings: SeatBooking[], requestedSeats: number) {
  return isReservationOverCapacity(
    {
      total_seats: totalSeats,
      policy: createCapacityPolicy(totalSeats),
    },
    bookings.map((booking) => ({
      quantity: booking.seats_booked,
    })),
    requestedSeats,
  );
}
