import { getEndTime, getSlotTimesInRange, normalizeSlotTime } from "./booking-schedule";
import { normalizeSeatLabels } from "./seat-maintenance";

export interface SeatBooking {
  seats_booked: number;
}

export interface SlotSeatBooking extends SeatBooking {
  start_time: string;
  end_time: string;
  seat_labels?: string[] | null;
}

export function getBookingsForRange<T extends SlotSeatBooking>(
  bookings: T[],
  startTime: string,
  endTime: string,
) {
  const requestedSlots = new Set(getSlotTimesInRange(startTime, endTime));

  return bookings.filter(booking => {
    return getSlotTimesInRange(booking.start_time, booking.end_time)
      .some(slot => requestedSlots.has(slot));
  });
}

export function getBookingsForSlot<T extends SlotSeatBooking>(
  bookings: T[],
  startTime: string,
) {
  const normalizedStartTime = normalizeSlotTime(startTime);
  return getBookingsForRange(bookings, normalizedStartTime, getEndTime(normalizedStartTime));
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

export function getUnavailableSeatLabels(
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

export function getAvailableSeatsForRange(
  totalSeats: number,
  bookings: SlotSeatBooking[],
  startTime: string,
  endTime: string,
  maintenanceSeatLabels: string[],
) {
  const unavailableLabels = new Set(normalizeSeatLabels(maintenanceSeatLabels));

  for (const slot of getSlotTimesInRange(startTime, endTime)) {
    const slotUnavailableLabels = getUnavailableSeatLabels(
      totalSeats,
      getBookingsForSlot(bookings, slot),
      maintenanceSeatLabels,
    );
    slotUnavailableLabels.forEach(label => unavailableLabels.add(label));
  }

  return Math.max(0, totalSeats - unavailableLabels.size);
}

export function isOverCapacity(totalSeats: number, bookings: SeatBooking[], requestedSeats: number) {
  return requestedSeats > getAvailableSeats(totalSeats, bookings);
}
