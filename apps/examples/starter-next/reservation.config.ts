import { createBookingFlowConfig } from "@reservation-platform/ui";

const config = createBookingFlowConfig({
  apiBaseUrl: process.env.NEXT_PUBLIC_RESERVATION_PLATFORM_BASE_URL,
  serviceId: process.env.NEXT_PUBLIC_RESERVATION_SERVICE_ID,
  labels: {
    resource: "Resource",
    quantity: "Guests",
    purpose: "Booking Notes",
  },
  theme: {
    brandName: "Starter Booking",
    button: "rounded-md bg-cyan-700 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-800",
    selected: "border-cyan-700 bg-cyan-700 text-white",
  },
});

export default config;
