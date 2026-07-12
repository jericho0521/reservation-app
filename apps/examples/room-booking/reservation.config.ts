const config = {
  apiBaseUrl: process.env.NEXT_PUBLIC_RESERVATION_PLATFORM_BASE_URL?.trim(),
  slug: process.env.NEXT_PUBLIC_RESERVATION_EXPERIENCE_SLUG?.trim() ?? "northstar-rooms",
  labels: {
    service: "Meeting",
    resource: "Room",
    customerName: "Organizer",
    quantity: "Attendees",
    purpose: "Meeting purpose",
  },
  theme: {
    brandName: "Northstar Rooms",
    shell: "rp-shell northstar-booking-shell",
    panel: "rp-panel northstar-summary",
    button: "rp-button northstar-button",
    buttonDisabled: "rp-button rp-button-disabled northstar-button-disabled",
    input: "rp-input northstar-input",
    selected: "rp-selected northstar-selected",
    muted: "northstar-muted",
    error: "rp-error northstar-error",
    success: "rp-success northstar-success",
  },
} as const;

export default config;
