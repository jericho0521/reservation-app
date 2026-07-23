import {
  isPlatformError,
  type AvailabilitySlot,
  type ReservationItemInput,
  type ReservationPlatformClient,
  type ReservationResponse,
  type ResourceResponse,
  type RescheduleManagedReservationInput,
} from "@reservation-platform/sdk";

export async function loadManagedReservation(
  client: Pick<ReservationPlatformClient, "getManagedReservation">,
  slug: string,
  token: string,
): Promise<{ found: true; reservation: ReservationResponse } | { found: false }> {
  try {
    return { found: true, reservation: await client.getManagedReservation(slug, token) };
  } catch (error) {
    if (isPlatformError(error) && error.body.status === 404) return { found: false };
    throw error;
  }
}

export async function loadManagedRescheduleAvailability(
  client: Pick<ReservationPlatformClient, "listManagedReservationAvailability">,
  slug: string,
  token: string,
  reservation: Pick<ReservationResponse, "service_id" | "staff_id" | "quantity">,
  date: string,
): Promise<{
  slots: AvailabilitySlot[];
  resourceStrategy?: "quantity" | "assigned_resource" | "hybrid";
  resources?: ResourceResponse[];
}> {
  const result = await client.listManagedReservationAvailability(slug, token, {
    service_id: reservation.service_id,
    date,
    quantity: reservation.quantity,
    ...(reservation.staff_id ? { staff_id: reservation.staff_id } : {}),
  });
  return {
    slots: result.slots.filter((slot) => slot.is_available && slot.available_quantity >= reservation.quantity),
    ...(result.resource_strategy ? { resourceStrategy: result.resource_strategy } : {}),
    ...(result.resources ? { resources: result.resources } : {}),
  };
}

export function supportsManagedReschedule(input: {
  staffId?: string;
  resourceStrategy?: "quantity" | "assigned_resource" | "hybrid";
  reservationItems?: ReservationItemInput[];
  resources?: ResourceResponse[];
}) {
  if (input.staffId) return true;
  if (input.resourceStrategy !== "quantity") return false;

  const resourcesById = new Map(
    (input.resources ?? []).map((resource) => [resource.resource_id, resource]),
  );
  return (input.reservationItems ?? []).every((item) => {
    if (item.resource_label) return false;
    if (!item.resource_id) return true;
    return resourcesById.get(item.resource_id)?.kind === "capacity_bucket";
  });
}

export async function submitManagedReschedule(
  client: Pick<ReservationPlatformClient, "rescheduleManagedReservation">,
  slug: string,
  token: string,
  input: RescheduleManagedReservationInput,
): Promise<{ updated: true; reservation: ReservationResponse } | { updated: false; conflict: true }> {
  try {
    return {
      updated: true,
      reservation: await client.rescheduleManagedReservation(slug, token, input),
    };
  } catch (error) {
    if (isPlatformError(error) && error.body.status === 409) {
      return { updated: false, conflict: true };
    }
    throw error;
  }
}
