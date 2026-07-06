"use client";

import { BookingFlow } from "@reservation-platform/ui";

import config from "../reservation.config";

export default function Page() {
  return (
    <main className="min-h-screen p-6">
      <BookingFlow
        {...config.booking}
        setupErrorTitle="Room backend configuration required"
        setupErrorMessage="Set NEXT_PUBLIC_RESERVATION_PLATFORM_BASE_URL and NEXT_PUBLIC_RESERVATION_SERVICE_ID."
      />
    </main>
  );
}
