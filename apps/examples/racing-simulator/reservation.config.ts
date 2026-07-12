const config = {
  apiBaseUrl: process.env.NEXT_PUBLIC_RESERVATION_PLATFORM_BASE_URL?.trim(),
  slug: process.env.NEXT_PUBLIC_RESERVATION_EXPERIENCE_SLUG?.trim() ?? "apex-grid",
  labels: {
    service: "Race Session",
    resource: "Simulator",
    customerName: "Driver",
    quantity: "Drivers",
    purpose: "Track or coaching notes",
  },
  theme: {
    brandName: "Apex Grid",
    shell: "rp-shell apex-booking-shell",
    panel: "rp-panel apex-summary",
    button: "rp-button apex-button",
    buttonDisabled: "rp-button rp-button-disabled apex-button-disabled",
    input: "rp-input apex-input",
    selected: "rp-selected apex-selected",
    muted: "apex-muted",
    error: "rp-error apex-error",
    success: "rp-success apex-success",
  },
} as const;

export default config;
