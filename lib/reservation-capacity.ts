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

export function getAvailableSeatsWithMaintenance(
  totalSeats: number,
  bookings: SeatBooking[],
  maintenanceSeatLabels: string[],
) {
  return Math.max(0, totalSeats - getBookedSeats(bookings) - maintenanceSeatLabels.length);
}

export function isOverCapacity(totalSeats: number, bookings: SeatBooking[], requestedSeats: number) {
  return requestedSeats > getAvailableSeats(totalSeats, bookings);
}
