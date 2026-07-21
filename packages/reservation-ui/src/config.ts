import type { BookingFlowProps } from "./components.js";
import type { ExperiencePreviewProps } from "./components.js";
import type { ExperienceDraftInput, ServiceResponse } from "@reservation-platform/contract-types";
import type { BookingLabels, ThemeClasses } from "./types.js";
import type { BookingVisualPresetId } from "./presets.js";

export interface BookingFlowConfigInput {
  apiBaseUrl?: string;
  serviceId?: string;
  labels?: Partial<BookingLabels>;
  theme?: ThemeClasses;
  visualPreset?: BookingVisualPresetId;
  initialQuantity?: number;
  useExistingProvider?: boolean;
}

export interface BookingFlowConfig {
  apiBaseUrl?: string;
  serviceId?: string;
  visualPreset?: BookingVisualPresetId;
  booking: BookingFlowProps;
}

export function createBookingFlowConfig(input: BookingFlowConfigInput): BookingFlowConfig {
  return {
    apiBaseUrl: normalizeOptionalString(input.apiBaseUrl),
    serviceId: normalizeOptionalString(input.serviceId),
    visualPreset: input.visualPreset,
    booking: {
      baseUrl: normalizeOptionalString(input.apiBaseUrl),
      serviceId: normalizeOptionalString(input.serviceId),
      labels: input.labels,
      theme: input.theme,
      visualPreset: input.visualPreset,
      initialQuantity: input.initialQuantity,
      useExistingProvider: input.useExistingProvider,
    },
  };
}

export function createExperiencePreviewConfig(
  draft: ExperienceDraftInput,
  services: ServiceResponse[],
): ExperiencePreviewProps {
  return {
    brandName: draft.branding.brand_name,
    description: draft.branding.description,
    primaryColor: draft.branding.primary_color,
    secondaryColor: draft.branding.secondary_color,
    bookingLabel: draft.terminology.booking,
    resourceLabel: draft.terminology.resource,
    channels: draft.channels,
    services,
  };
}

function normalizeOptionalString(value: string | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}
