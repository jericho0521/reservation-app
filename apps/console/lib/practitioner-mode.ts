import type { ResourceResponse, ServiceResponse } from "@reservation-platform/sdk";

export function usesPractitionerOperations(
  services: Array<Pick<ServiceResponse, "booking_mode" | "is_active">>,
  presetId?: string,
) {
  const activeServices = services.filter((service) => service.is_active !== false);
  const servicesWithExplicitModes = activeServices.filter((service) => service.booking_mode !== undefined);

  if (servicesWithExplicitModes.length > 0) {
    return servicesWithExplicitModes.some((service) => service.booking_mode === "appointment");
  }

  return presetId === "appointments_salon";
}

export function isActivePractitionerResource(
  resource: Pick<ResourceResponse, "metadata"> & Partial<Pick<ResourceResponse, "is_active">>,
) {
  return resource.is_active !== false
    && typeof resource.metadata?.platform_staff_id === "string";
}
