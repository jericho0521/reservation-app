import type {
  ExperienceDraftInput,
  ExperiencePresetId,
  ExperiencePresetSummary,
  ExperienceValidationResponse,
  ListExperiencePresetsResponse,
} from "@reservation-platform/contract-types";

function preset(
  value: ExperiencePresetSummary,
): Readonly<ExperiencePresetSummary> {
  Object.freeze(value.terminology);
  return Object.freeze(value);
}

export const experiencePresets: readonly Readonly<ExperiencePresetSummary>[] = Object.freeze([
  preset({
    preset_id: "racing_gaming",
    name: "Racing & Gaming",
    description: "Assigned simulator and gaming-station sessions.",
    resource_strategy: "assigned_resource",
    terminology: { customer: "Driver", resource: "Simulator", booking: "Session" },
  }),
  preset({
    preset_id: "rooms_facilities",
    name: "Rooms & Facilities",
    description: "Capacity-aware room and facility reservations.",
    resource_strategy: "hybrid",
    terminology: { customer: "Organizer", resource: "Room", booking: "Meeting" },
  }),
  preset({
    preset_id: "appointments_salon",
    name: "Appointments & Salon",
    description: "Appointments assigned to an available specialist.",
    resource_strategy: "assigned_resource",
    terminology: { customer: "Client", resource: "Specialist", booking: "Appointment" },
  }),
  preset({
    preset_id: "sports_courts",
    name: "Sports Courts",
    description: "Court reservations for matches and practice sessions.",
    resource_strategy: "assigned_resource",
    terminology: { customer: "Player", resource: "Court", booking: "Match" },
  }),
  preset({
    preset_id: "restaurant_tables",
    name: "Restaurant Tables",
    description: "Guest reservations assigned to capacity-matched tables.",
    resource_strategy: "hybrid",
    terminology: { customer: "Guest", resource: "Table", booking: "Reservation" },
  }),
  preset({
    preset_id: "cinema_events",
    name: "Cinema & Events",
    description: "Screening and event reservations with assigned seating.",
    resource_strategy: "assigned_resource",
    terminology: { customer: "Attendee", resource: "Seat", booking: "Screening" },
  }),
  preset({
    preset_id: "equipment_rental",
    name: "Equipment Rental",
    description: "Time-bound rentals assigned to available equipment.",
    resource_strategy: "assigned_resource",
    terminology: { customer: "Customer", resource: "Item", booking: "Rental" },
  }),
  preset({
    preset_id: "classes_workshops",
    name: "Classes & Workshops",
    description: "Shared-capacity class and workshop registration.",
    resource_strategy: "quantity",
    terminology: { customer: "Participant", resource: "Class", booking: "Registration" },
  }),
]);

export function listExperiencePresets(): ListExperiencePresetsResponse {
  return {
    presets: experiencePresets.map((value) => ({
      ...value,
      terminology: { ...value.terminology },
    })),
  };
}

export function getExperiencePreset(
  id: ExperiencePresetId,
): Readonly<ExperiencePresetSummary> | undefined {
  return experiencePresets.find((value) => value.preset_id === id);
}

export function createExperienceDraftFromPreset(id: ExperiencePresetId): ExperienceDraftInput {
  const value = getExperiencePreset(id);
  if (!value) {
    throw new Error(`Unknown experience preset: ${id}`);
  }

  return {
    preset_id: value.preset_id,
    branding: {
      brand_name: value.name,
      primary_color: value.preset_id === "racing_gaming" ? "#f59e0b" : "#2563eb",
    },
    terminology: { ...value.terminology },
    channels: { web_booking: true, web_chat: false, whatsapp: false },
  };
}

export function validateExperienceDraft(
  input: ExperienceDraftInput,
): ExperienceValidationResponse {
  const issues: ExperienceValidationResponse["issues"] = [];
  const requiredStrings: Array<[string, string, string]> = [
    ["branding.brand_name", input.branding.brand_name, "Business name is required."],
    ["terminology.customer", input.terminology.customer, "Customer terminology is required."],
    ["terminology.resource", input.terminology.resource, "Resource terminology is required."],
    ["terminology.booking", input.terminology.booking, "Booking terminology is required."],
  ];

  for (const [path, value, message] of requiredStrings) {
    if (value.trim().length === 0) {
      issues.push({ path, message });
    }
  }

  const colors: Array<[string, string | undefined]> = [
    ["branding.primary_color", input.branding.primary_color],
    ["branding.secondary_color", input.branding.secondary_color],
  ];
  for (const [path, value] of colors) {
    if (value !== undefined && !/^#[0-9a-fA-F]{6}$/.test(value)) {
      issues.push({ path, message: "Color must be a six-digit hexadecimal value." });
    }
  }

  if (!input.channels.web_booking && !input.channels.web_chat && !input.channels.whatsapp) {
    issues.push({ path: "channels", message: "At least one customer channel must be enabled." });
  }

  return { valid: issues.length === 0, issues };
}
