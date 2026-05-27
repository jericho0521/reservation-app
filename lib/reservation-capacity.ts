import { normalizeSeatLabels } from "./seat-maintenance";

export interface SeatBooking {
  seats_booked: number;
}

export interface SlotSeatBooking extends SeatBooking {
  start_time: string;
  seat_labels?: string[] | null;
}

export function normalizeSlotTime(time: string) {
  return time.slice(0, 5);
}

export function getBookingsForSlot<T extends SlotSeatBooking>(
  bookings: T[],
  startTime: string,
) {
  const normalizedStartTime = normalizeSlotTime(startTime);

  return bookings.filter(
    (booking) => normalizeSlotTime(booking.start_time) === normalizedStartTime,
  );
}

export function getBookedSeatLabels(bookings: Pick<SlotSeatBooking, "seat_labels">[]) {
  return new Set(
    bookings.flatMap((booking) => (
      Array.isArray(booking.seat_labels)
        ? booking.seat_labels.filter((label): label is string => typeof label === "string")
        : []
    )),
  );
}

export function getConflictingSeatLabels(
  bookings: Pick<SlotSeatBooking, "seat_labels">[],
  requestedSeatLabels: string[],
) {
  const bookedSeatLabels = getBookedSeatLabels(bookings);

  return requestedSeatLabels.filter((label) => bookedSeatLabels.has(label));
}

export function getBookedSeats(bookings: SeatBooking[]) {
  return bookings.reduce((sum, booking) => sum + booking.seats_booked, 0);
}

export function getAvailableSeats(totalSeats: number, bookings: SeatBooking[]) {
  return totalSeats - getBookedSeats(bookings);
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
  return requestedSeats > getAvailableSeats(totalSeats, bookings);
}
