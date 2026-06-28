"use client";

import { BookingFlow } from "@reservation-platform/ui";

import config from "../reservation.config";

export default function Page() {
  if (!config.apiBaseUrl || !config.serviceId) {
    return <SetupError />;
  }

  return (
    <main className="min-h-screen p-6">
      <BookingFlow
        baseUrl={config.apiBaseUrl}
        serviceId={config.serviceId}
        labels={config.labels}
        theme={config.theme}
      />
    </main>
  );
}

function SetupError() {
  return (
    <main className="mx-auto grid min-h-screen max-w-3xl place-items-center p-6">
      <section className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-800">
        <h1 className="text-xl font-semibold">Room backend configuration required</h1>
        <p className="mt-2 text-sm">
          Set NEXT_PUBLIC_RESERVATION_PLATFORM_BASE_URL and NEXT_PUBLIC_RESERVATION_SERVICE_ID.
        </p>
      </section>
    </main>
  );
}
