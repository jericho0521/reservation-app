import { headers } from "next/headers";
import { getAdminBookingsLoadError, type AdminBooking } from "@/app/admin/dashboard-data";
import { listAdminReservations } from "@/lib/reservation-platform-client";

export interface AdminReservationsLoadResult {
  bookings: AdminBooking[];
  todayCount: number;
  loadError: string | null;
}

type ListAdminReservations = typeof listAdminReservations;

interface LoadAdminReservationsOptions {
  today?: string;
  listReservations?: ListAdminReservations;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Failed to load bookings";
}

function getConfirmedTodayCount(bookings: AdminBooking[], today: string) {
  return bookings.filter((booking) =>
    booking.booking_date === today && booking.status === "confirmed"
  ).length;
}

function getReservationListTodayCount(bookings: Awaited<ReturnType<ListAdminReservations>>, today: string) {
  return bookings.summary?.confirmed_today ?? getConfirmedTodayCount(bookings, today);
}

async function getCurrentRequestReservationFetchInput() {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  const cookie = requestHeaders.get("cookie");
  const forwardedHeaders = new Headers();

  if (cookie) {
    forwardedHeaders.set("cookie", cookie);
  }

  return {
    baseUrl: host ? `${protocol}://${host}` : undefined,
    headers: forwardedHeaders,
  };
}

export async function loadAdminReservations(
  options: LoadAdminReservationsOptions = {},
): Promise<AdminReservationsLoadResult> {
  const today = options.today ?? new Date().toISOString().split("T")[0];
  const listReservations = options.listReservations ?? listAdminReservations;

  try {
    const bookings = await listReservations(
      options.listReservations ? undefined : await getCurrentRequestReservationFetchInput(),
    );

    return {
      bookings,
      todayCount: getReservationListTodayCount(bookings, today),
      loadError: null,
    };
  } catch (error) {
    return {
      bookings: [],
      todayCount: 0,
      loadError: getAdminBookingsLoadError({ message: getErrorMessage(error) }, null),
    };
  }
}
