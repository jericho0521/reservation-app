const config = {
  apiBaseUrl: process.env.NEXT_PUBLIC_RESERVATION_PLATFORM_BASE_URL?.trim(),
  slug: process.env.NEXT_PUBLIC_RESERVATION_EXPERIENCE_SLUG?.trim() ?? "luma-studio",
  labels: {
    service: "Appointment",
    resource: "Specialist",
    customerName: "Client",
    quantity: "Guests",
    purpose: "What would you like to focus on?",
  },
  theme: {
    brandName: "Luma Studio",
    shell: "rp-shell luma-booking-shell",
    panel: "rp-panel luma-summary",
    button: "rp-button luma-button",
    buttonDisabled: "rp-button rp-button-disabled luma-button-disabled",
    input: "rp-input luma-input",
    selected: "rp-selected luma-selected",
    muted: "luma-muted",
    error: "rp-error luma-error",
    success: "rp-success luma-success",
  },
} as const;

export default config;
