import { createBookingFlowConfig } from "@reservation-platform/ui";

const config = createBookingFlowConfig({
  apiBaseUrl: process.env.NEXT_PUBLIC_RESERVATION_PLATFORM_BASE_URL,
  serviceId: process.env.NEXT_PUBLIC_RESERVATION_SERVICE_ID,
  labels: {
    resource: "Room",
    quantity: "Attendees",
    purpose: "Meeting Purpose",
  },
  theme: {
    brandName: "Room Booking",
    shell: "mx-auto grid max-w-5xl gap-4 rounded-lg border border-emerald-200 bg-white p-4 text-slate-950 shadow-sm",
    button: "rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800",
    selected: "border-emerald-700 bg-emerald-700 text-white",
  },
});

export default config;
