import type { BookingFlowProps } from "./components.js";
import type { BookingLabels, ThemeClasses } from "./types.js";

export interface BookingFlowConfigInput {
  apiBaseUrl?: string;
  serviceId?: string;
  labels?: Partial<BookingLabels>;
  theme?: ThemeClasses;
  initialQuantity?: number;
  useExistingProvider?: boolean;
}

export interface BookingFlowConfig {
  apiBaseUrl?: string;
  serviceId?: string;
  booking: BookingFlowProps;
}

export function createBookingFlowConfig(input: BookingFlowConfigInput): BookingFlowConfig {
  return {
    apiBaseUrl: normalizeOptionalString(input.apiBaseUrl),
    serviceId: normalizeOptionalString(input.serviceId),
    booking: {
      baseUrl: normalizeOptionalString(input.apiBaseUrl),
      serviceId: normalizeOptionalString(input.serviceId),
      labels: input.labels,
      theme: input.theme,
      initialQuantity: input.initialQuantity,
      useExistingProvider: input.useExistingProvider,
    },
  };
}

function normalizeOptionalString(value: string | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}
