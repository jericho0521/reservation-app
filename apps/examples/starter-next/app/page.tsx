"use client";

import { BookingFlow } from "@reservation-platform/ui";

import config from "../reservation.config";

export default function Page() {
  return (
    <main className="min-h-screen p-6">
      <BookingFlow {...config.booking} />
    </main>
  );
}
