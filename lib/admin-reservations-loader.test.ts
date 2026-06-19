import assert from "node:assert/strict";
import test from "node:test";
import { loadAdminReservations } from "./admin-reservations-loader";
import type { AdminBooking } from "@/app/admin/dashboard-data";

const bookings: AdminBooking[] = [
  {
    id: "1",
    user_name: "A",
    user_email: "a@example.com",
    booking_date: "2026-06-13",
    start_time: "12:00",
    end_time: "13:00",
    seats_booked: 1,
    status: "confirmed",
    services: { name: "Simulator" },
  },
  {
    id: "2",
    user_name: "B",
    user_email: "b@example.com",
    booking_date: "2026-06-13",
    start_time: "14:00",
    end_time: "15:00",
    seats_booked: 1,
    status: "cancelled",
    services: { name: "Simulator" },
  },
  {
    id: "3",
    user_name: "C",
    user_email: "c@example.com",
    booking_date: "2026-06-14",
    start_time: "14:00",
    end_time: "15:00",
    seats_booked: 1,
    status: "confirmed",
    services: { name: "Simulator" },
  },
];

test("loadAdminReservations derives todayCount from returned confirmed bookings", async () => {
  const result = await loadAdminReservations({
    today: "2026-06-13",
    listReservations: async () => bookings,
  });

  assert.deepEqual(result, {
    bookings,
    todayCount: 1,
    loadError: null,
  });
});

test("loadAdminReservations uses platform summary count when available", async () => {
  const reservationsWithSummary = Object.defineProperty([...bookings], "summary", {
    value: { confirmed_today: 12 },
    enumerable: false,
  }) as typeof bookings & { summary: { confirmed_today: number } };

  const result = await loadAdminReservations({
    today: "2026-06-13",
    listReservations: async () => reservationsWithSummary,
  });

  assert.deepEqual(result, {
    bookings: reservationsWithSummary,
    todayCount: 12,
    loadError: null,
  });
});

test("loadAdminReservations converts wrapper failures into dashboard load errors", async () => {
  const result = await loadAdminReservations({
    today: "2026-06-13",
    listReservations: async () => {
      throw new Error("Failed to load bookings");
    },
  });

  assert.deepEqual(result, {
    bookings: [],
    todayCount: 0,
    loadError: "Failed to load bookings",
  });
});
