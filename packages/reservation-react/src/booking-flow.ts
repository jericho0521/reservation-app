import { createIdempotencyKey, isPlatformError, type ReservationPlatformClient } from "@reservation-platform/sdk";
import type {
  AvailabilityResponse,
  AvailabilitySlot,
  CreateReservationInput,
  CustomerSnapshot,
  ReservationItemInput,
  ReservationResponse,
  ResourceResponse,
  ServiceResponse,
} from "@reservation-platform/contract-types";

export type BookingStrategy = "quantity" | "assigned_resource" | "hybrid";
export type BookingJourneyStep = "date" | "slot" | "options" | "details" | "review" | "success";

export const bookingJourneySteps = ["date", "slot", "options", "details", "review"] as const;

export interface BookingFlowState {
  serviceId: string;
  service?: ServiceResponse;
  availability?: AvailabilityResponse;
  date: string;
  selectedSlot?: AvailabilitySlot;
  quantity: number;
  selectedResourceIds: string[];
  selectedResourceLabels: string[];
  customer: CustomerSnapshot;
  purpose: string;
  submitting: boolean;
  error?: string;
  reservation?: ReservationResponse;
}

export interface BookingFlowValidation {
  isValid: boolean;
  missing: BookingFlowMissingReason[];
  submitLabel: string;
}

export type BookingFlowMissingReason =
  | "service"
  | "availability"
  | "slot"
  | "quantity"
  | "resources"
  | "customer";

export function getServiceStrategy(service?: Pick<ServiceResponse, "resource_strategy">): BookingStrategy {
  return service?.resource_strategy ?? "quantity";
}

export function getSlotStart(slot: AvailabilitySlot | undefined) {
  return slot?.start_at ?? slot?.start_time;
}

export function getSlotEnd(slot: AvailabilitySlot | undefined) {
  return slot?.end_at ?? slot?.end_time;
}

export function isSlotBookable(slot: AvailabilitySlot | undefined, quantity: number) {
  return Boolean(slot?.is_available && slot.available_quantity >= quantity);
}

export function resolveSelectedAvailabilitySlot(
  state: Pick<BookingFlowState, "availability" | "selectedSlot">,
) {
  const selectedStart = getSlotStart(state.selectedSlot);
  const selectedEnd = getSlotEnd(state.selectedSlot);
  if (!selectedStart || !selectedEnd) {
    return undefined;
  }
  return state.availability?.slots.find((slot) => (
    getSlotStart(slot) === selectedStart && getSlotEnd(slot) === selectedEnd
  ));
}

export function unavailableSelectedResourceLabels(
  state: Pick<BookingFlowState, "selectedResourceLabels" | "selectedSlot">,
) {
  const unavailable = new Set([
    ...(state.selectedSlot?.taken_resource_labels ?? []),
    ...(state.selectedSlot?.maintenance_resource_labels ?? []),
  ]);
  return state.selectedResourceLabels.filter((label) => unavailable.has(label));
}

export function buildReservationItems(resources: ResourceResponse[]): ReservationItemInput[] {
  return resources.map((resource) => ({
    resource_id: resource.resource_id,
    resource_label: resource.label,
    quantity: 1,
  }));
}

export function validateBookingFlow(state: BookingFlowState): BookingFlowValidation {
  const missing: BookingFlowMissingReason[] = [];
  const strategy = getServiceStrategy(state.service);

  if (!state.serviceId) missing.push("service");
  if (!state.availability) missing.push("availability");
  const currentSelectedSlot = resolveSelectedAvailabilitySlot(state);
  if (!isSlotBookable(currentSelectedSlot, state.quantity)) missing.push("slot");
  if (!Number.isInteger(state.quantity) || state.quantity < 1) missing.push("quantity");
  const usesAssignedResources = strategy === "assigned_resource" || state.selectedResourceIds.length > 0;
  if (usesAssignedResources && state.selectedResourceIds.length !== state.quantity) {
    missing.push("resources");
  }
  if (
    usesAssignedResources
      && unavailableSelectedResourceLabels({ ...state, selectedSlot: currentSelectedSlot }).length > 0
  ) {
    missing.push("resources");
  }
  if (!state.customer.name?.trim()) missing.push("customer");

  return {
    isValid: missing.length === 0 && !state.submitting,
    missing,
    submitLabel: submitLabelForMissing(missing, state.submitting),
  };
}

export function submitLabelForMissing(missing: BookingFlowMissingReason[], submitting = false) {
  if (submitting) return "Creating Reservation";
  if (missing.includes("service")) return "Select a Service";
  if (missing.includes("availability")) return "Load Availability";
  if (missing.includes("slot")) return "Select a Time Slot";
  if (missing.includes("quantity")) return "Choose Quantity";
  if (missing.includes("resources")) return "Select Resources";
  if (missing.includes("customer")) return "Add Customer Details";
  return "Confirm Reservation";
}

export function canAdvanceBookingJourney(step: BookingJourneyStep, state: BookingFlowState) {
  const currentSlot = resolveSelectedAvailabilitySlot(state);
  const strategy = getServiceStrategy(state.service);
  switch (step) {
    case "date": return Boolean(state.serviceId && state.date && state.availability);
    case "slot": return isSlotBookable(currentSlot, state.quantity);
    case "options": {
      if (!Number.isInteger(state.quantity) || state.quantity < 1) return false;
      return strategy !== "assigned_resource" || state.selectedResourceIds.length === state.quantity;
    }
    case "details": return Boolean(state.customer.name?.trim() && state.customer.email?.trim());
    case "review": return validateBookingFlow(state).isValid;
    case "success": return false;
  }
}

export function nextBookingJourneyStep(step: BookingJourneyStep, state: BookingFlowState): BookingJourneyStep {
  if (!canAdvanceBookingJourney(step, state)) return step;
  const index = bookingJourneySteps.indexOf(step as typeof bookingJourneySteps[number]);
  return bookingJourneySteps[index + 1] ?? "review";
}

export function previousBookingJourneyStep(step: BookingJourneyStep): BookingJourneyStep {
  if (step === "success") return "review";
  const index = bookingJourneySteps.indexOf(step as typeof bookingJourneySteps[number]);
  return bookingJourneySteps[Math.max(0, index - 1)] ?? "date";
}

export function bookingErrorMessage(error: unknown) {
  if (isPlatformError(error)) {
    if (error.body.code === "conflict" || error.body.code === "validation_failed") {
      return "That option is no longer available. Refresh availability and choose another time.";
    }
    return error.body.message;
  }
  return error instanceof Error ? error.message : "Reservation request failed.";
}

export function createReservationPayload(state: BookingFlowState): CreateReservationInput {
  const currentSelectedSlot = resolveSelectedAvailabilitySlot(state);
  if (state.availability && state.selectedSlot && !currentSelectedSlot) {
    throw new Error("Selected slot is no longer available.");
  }

  const payloadSlot = currentSelectedSlot ?? state.selectedSlot;
  const start = getSlotStart(payloadSlot);
  const end = getSlotEnd(payloadSlot);
  if (!start || !end) {
    throw new Error("Cannot create a reservation without a selected slot.");
  }

  return {
    service_id: state.serviceId,
    date: state.date,
    start_time: start,
    end_time: end,
    quantity: state.quantity,
    ...(state.selectedResourceIds.length > 0 ? { resource_ids: state.selectedResourceIds } : {}),
    ...(state.selectedResourceLabels.length > 0
      ? {
          reservation_items: state.selectedResourceLabels.map((resource_label) => ({
            resource_label,
            quantity: 1,
          })),
        }
      : {}),
    customer: state.customer,
    source: "reservation-platform-react",
    metadata: state.purpose.trim() ? { purpose: state.purpose.trim() } : undefined,
  };
}

export async function submitBookingFlow(input: {
  client: Pick<ReservationPlatformClient, "createReservation" | "listAvailability">;
  state: BookingFlowState;
}) {
  const validation = validateBookingFlow(input.state);
  if (!validation.isValid) {
    throw new Error(validation.submitLabel);
  }

  const reservation = await input.client.createReservation(
    createReservationPayload(input.state),
    { idempotencyKey: createIdempotencyKey("reservation-ui") },
  );
  const availability = await input.client.listAvailability({
    service_id: input.state.serviceId,
    date: input.state.date,
    quantity: input.state.quantity,
    resource_ids: input.state.selectedResourceIds.length > 0
      ? input.state.selectedResourceIds
      : undefined,
  });

  return { reservation, availability };
}

export interface BookingSubmissionGuard {
  current?: Promise<Awaited<ReturnType<typeof submitBookingFlow>>>;
}

export function submitBookingFlowOnce(
  input: Parameters<typeof submitBookingFlow>[0],
  guard: BookingSubmissionGuard,
) {
  if (guard.current) return guard.current;
  const submission = submitBookingFlow(input).finally(() => {
    if (guard.current === submission) guard.current = undefined;
  });
  guard.current = submission;
  return submission;
}
