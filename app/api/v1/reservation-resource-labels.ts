import type {
  CreateReservationInput,
  ReservationItemInput,
  RescheduleReservationInput,
} from "@reservation-platform/contract-types";
import { createReservationResourceLabelRepository } from "./catalog-repository";

type ReservationMutationInput = CreateReservationInput | RescheduleReservationInput;
type ResourceLabelRepository = {
  resolveLabelsById(serviceId: string, ids: string[]): Promise<Map<string, string>>;
};
type ResourceLabelRepositoryFactory = () => ResourceLabelRepository;

function requestedResourceIds(input: ReservationMutationInput) {
  const ids = [
    ...(input.resource_ids ?? []),
    ...(input.reservation_items ?? [])
      .map((item) => item.resource_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  ];
  return Array.from(new Set(ids));
}

function itemWithResolvedLabel(
  item: ReservationItemInput,
  labelsById: Map<string, string>,
): ReservationItemInput {
  if (!item.resource_id || item.resource_label) {
    return item;
  }

  const label = labelsById.get(item.resource_id);
  if (!label) {
    return item;
  }

  return {
    resource_label: label,
    quantity: item.quantity,
  };
}

function serviceIdFromReservationMutation(input: ReservationMutationInput) {
  return "service_id" in input && typeof input.service_id === "string"
    ? input.service_id
    : null;
}

export async function resolveResourceIdsForLegacyReservation<T extends ReservationMutationInput>(
  input: T,
  createRepository: ResourceLabelRepositoryFactory = createReservationResourceLabelRepository,
): Promise<T> {
  const ids = requestedResourceIds(input);
  if (ids.length === 0) {
    return input;
  }

  const serviceId = serviceIdFromReservationMutation(input);
  if (!serviceId || serviceId.trim().length === 0) {
    return input;
  }

  const labelsById = await createRepository()
    .resolveLabelsById(serviceId, ids);

  return {
    ...input,
    resource_ids: input.resource_ids
      ?.map((id) => labelsById.get(id) ?? id),
    reservation_items: input.reservation_items
      ?.map((item) => itemWithResolvedLabel(item, labelsById)),
  };
}
