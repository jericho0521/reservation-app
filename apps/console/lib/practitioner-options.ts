import type { ReservationResponse, ResourceResponse } from "@reservation-platform/sdk";
import { isActivePractitionerResource } from "./practitioner-mode";

export interface PractitionerOption {
  id: string;
  label: string;
  serviceIds: string[];
  isGlobal: boolean;
  isBookable: boolean;
}

export function buildPractitionerOptions(
  reservations: Array<Pick<ReservationResponse, "staff_id" | "metadata">>,
  resources: Array<Pick<ResourceResponse, "is_active" | "label" | "metadata" | "service_id">>,
) {
  const options = new Map<string, PractitionerOption>();

  for (const resource of resources) {
    if (!isActivePractitionerResource(resource)) continue;
    const staffId = resource.metadata?.platform_staff_id as string;
    const existing = options.get(staffId);
    if (existing) {
      if (resource.service_id && !existing.serviceIds.includes(resource.service_id)) {
        existing.serviceIds.push(resource.service_id);
      }
      if (!resource.service_id) existing.isGlobal = true;
      continue;
    }
    options.set(staffId, {
      id: staffId,
      label: resource.label,
      serviceIds: resource.service_id ? [resource.service_id] : [],
      isGlobal: !resource.service_id,
      isBookable: true,
    });
  }

  for (const reservation of reservations) {
    if (!reservation.staff_id || options.has(reservation.staff_id)) continue;
    const named = reservation.metadata?.staff_name;
    options.set(reservation.staff_id, {
      id: reservation.staff_id,
      label: typeof named === "string" ? named : `Practitioner ${reservation.staff_id.slice(0, 8)}`,
      serviceIds: [],
      isGlobal: false,
      isBookable: false,
    });
  }

  return [...options.values()].sort((left, right) => left.label.localeCompare(right.label));
}

export function practitionersForService(practitioners: PractitionerOption[], serviceId: string) {
  if (!serviceId) return [];
  return practitioners.filter((practitioner) => (
    practitioner.isBookable
    && (practitioner.isGlobal || practitioner.serviceIds.includes(serviceId))
  ));
}
