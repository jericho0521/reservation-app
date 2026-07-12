import { createIdempotencyKey } from "@reservation-platform/sdk";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AvailabilityQuery,
  AvailabilityResponse,
  AvailabilitySlot,
  CustomerSnapshot,
  ListServicesQuery,
  ReservationResponse,
  ResourceResponse,
  ServiceResponse,
} from "@reservation-platform/contract-types";

import { useReservationClient } from "./provider.js";
import {
  createReservationPayload,
  getServiceStrategy,
  getSlotEnd,
  getSlotStart,
  isSlotBookable,
  submitBookingFlowOnce,
  validateBookingFlow,
  localDateInputValue,
  type BookingFlowState,
} from "./booking-flow.js";

export interface AsyncState<T> {
  data?: T;
  loading: boolean;
  error?: Error;
  refetch: () => Promise<T | undefined>;
}

interface VersionedAsyncData<T> {
  key: string;
  data: T;
}

function toError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}

function availabilityQueryKey(input: AvailabilityQuery | undefined) {
  if (!input?.service_id) {
    return "";
  }

  const params = new URLSearchParams();
  params.set("service_id", input.service_id);
  if (input.date) params.set("date", input.date);
  if (input.start_at) params.set("start_at", input.start_at);
  if (input.end_at) params.set("end_at", input.end_at);
  if (input.quantity !== undefined) params.set("quantity", String(input.quantity));
  if (input.venue_id) params.set("venue_id", input.venue_id);
  for (const resourceId of input.resource_ids ?? []) {
    params.append("resource_ids", resourceId);
  }
  return params.toString();
}

export function useServices(input?: ListServicesQuery): AsyncState<ServiceResponse[]> {
  const client = useReservationClient();
  const [data, setData] = useState<ServiceResponse[]>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error>();

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const result = await client.listServices(input);
      setData(result.services);
      return result.services;
    } catch (caught) {
      const nextError = toError(caught);
      setError(nextError);
      return undefined;
    } finally {
      setLoading(false);
    }
  }, [client, input?.include_inactive, input?.venue_id]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}

export function useService(serviceId: string | undefined) {
  const client = useReservationClient();
  const [data, setData] = useState<ServiceResponse>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error>();

  const refetch = useCallback(async () => {
    if (!serviceId) {
      setData(undefined);
      return undefined;
    }
    setLoading(true);
    setError(undefined);
    try {
      const result = await client.getService(serviceId);
      setData(result);
      return result;
    } catch (caught) {
      const nextError = toError(caught);
      setError(nextError);
      return undefined;
    } finally {
      setLoading(false);
    }
  }, [client, serviceId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}

export function useAvailability(input: AvailabilityQuery | undefined): AsyncState<AvailabilityResponse> {
  const client = useReservationClient();
  const [data, setData] = useState<VersionedAsyncData<AvailabilityResponse>>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error>();
  const requestId = useRef(0);

  const resourceIdsKey = input?.resource_ids?.join(",");
  const inputKey = availabilityQueryKey(input);
  const refetch = useCallback(async () => {
    const currentRequestId = requestId.current + 1;
    requestId.current = currentRequestId;
    setData(undefined);

    if (!input?.service_id) {
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    setError(undefined);
    try {
      const result = await client.listAvailability(input);
      if (requestId.current === currentRequestId) {
        setData({ key: inputKey, data: result });
      }
      return result;
    } catch (caught) {
      const nextError = toError(caught);
      if (requestId.current === currentRequestId) {
        setError(nextError);
      }
      return undefined;
    } finally {
      if (requestId.current === currentRequestId) {
        setLoading(false);
      }
    }
  }, [
    client,
    input?.date,
    input?.end_at,
    inputKey,
    input?.quantity,
    resourceIdsKey,
    input?.service_id,
    input?.start_at,
    input?.venue_id,
  ]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const currentData = data?.key === inputKey ? data.data : undefined;
  const currentLoading = loading || Boolean(input?.service_id && data?.key !== inputKey);

  return { data: currentData, loading: currentLoading, error, refetch };
}

export function useCreateReservation() {
  const client = useReservationClient();
  const [data, setData] = useState<ReservationResponse>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error>();

  const createReservation = useCallback(async (state: BookingFlowState) => {
    setLoading(true);
    setError(undefined);
    try {
      const validation = validateBookingFlow(state);
      if (!validation.isValid) {
        throw new Error(validation.submitLabel);
      }

      const result = await client.createReservation(
        createReservationPayload(state),
        { idempotencyKey: createIdempotencyKey("reservation-react") },
      );
      setData(result);
      return result;
    } catch (caught) {
      const nextError = toError(caught);
      setError(nextError);
      throw nextError;
    } finally {
      setLoading(false);
    }
  }, [client]);

  return { data, loading, error, createReservation };
}

export interface UseBookingFlowOptions {
  serviceId: string;
  initialDate?: string;
  initialQuantity?: number;
  initialCustomer?: CustomerSnapshot;
}

export function useBookingFlow({
  serviceId,
  initialDate = localDateInputValue(),
  initialQuantity = 1,
  initialCustomer = {},
}: UseBookingFlowOptions) {
  const client = useReservationClient();
  const service = useService(serviceId);
  const [date, setDate] = useState(initialDate);
  const [quantity, setQuantity] = useState(initialQuantity);
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot>();
  const [selectedResources, setSelectedResources] = useState<ResourceResponse[]>([]);
  const [customer, setCustomer] = useState<CustomerSnapshot>(initialCustomer);
  const [purpose, setPurpose] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [reservation, setReservation] = useState<ReservationResponse>();
  const [error, setError] = useState<Error>();
  const submissionGuard = useRef({});

  const availability = useAvailability({ service_id: serviceId, date, quantity });
  const unavailableResourceLabelsKey = [
    ...(selectedSlot?.taken_resource_labels ?? []),
    ...(selectedSlot?.maintenance_resource_labels ?? []),
  ].join(",");

  useEffect(() => {
    if (!availability.data) {
      return;
    }

    if (selectedSlot) {
      const selectedStart = getSlotStart(selectedSlot);
      const selectedEnd = getSlotEnd(selectedSlot);
      const refreshedSlot = availability.data.slots.find((slot) => (
        getSlotStart(slot) === selectedStart && getSlotEnd(slot) === selectedEnd
      ));
      if (!refreshedSlot || !isSlotBookable(refreshedSlot, quantity)) {
        setSelectedSlot(undefined);
      } else if (refreshedSlot !== selectedSlot) {
        setSelectedSlot(refreshedSlot);
      }
    }

    const unavailable = new Set([
      ...(selectedSlot?.taken_resource_labels ?? []),
      ...(selectedSlot?.maintenance_resource_labels ?? []),
    ]);
    const availableResourceIds = new Set((availability.data?.resources ?? []).map((resource: ResourceResponse) => resource.resource_id));
    const next = selectedResources.filter((resource: ResourceResponse) => (
      availableResourceIds.has(resource.resource_id)
        && resource.is_active
        && !unavailable.has(resource.label)
    ));
    if (next.length !== selectedResources.length) {
      setSelectedResources(next);
      if (getServiceStrategy(service.data) === "assigned_resource") {
        setQuantity(Math.max(1, next.length));
      }
    }
  }, [
    availability.data,
    availability.data?.resources,
    quantity,
    selectedResources,
    selectedSlot,
    service.data,
    unavailableResourceLabelsKey,
  ]);

  const state: BookingFlowState = useMemo(() => ({
    serviceId,
    service: service.data,
    availability: availability.data,
    date,
    selectedSlot,
    quantity,
    selectedResourceIds: selectedResources.map((resource: ResourceResponse) => resource.resource_id),
    selectedResourceLabels: selectedResources.map((resource: ResourceResponse) => resource.label),
    selectedResourceCapacities: selectedResources.map((resource: ResourceResponse) => resource.capacity ?? 1),
    customer,
    purpose,
    submitting,
    error: error?.message,
    reservation,
  }), [
    availability.data,
    customer,
    date,
    error?.message,
    purpose,
    quantity,
    reservation,
    selectedResources,
    selectedSlot,
    service.data,
    serviceId,
    submitting,
  ]);

  const validation = useMemo(() => validateBookingFlow(state), [state]);

  const submit = useCallback(async () => {
    setSubmitting(true);
    setError(undefined);
    try {
      const result = await submitBookingFlowOnce({ client, state }, submissionGuard.current);
      setReservation(result.reservation);
      return result.reservation;
    } catch (caught) {
      const nextError = toError(caught);
      setError(nextError);
      throw nextError;
    } finally {
      setSubmitting(false);
      await availability.refetch();
    }
  }, [availability, client, state]);

  return {
    state,
    service,
    availability,
    validation,
    actions: {
      setDate,
      setQuantity,
      setSelectedSlot,
      setSelectedResources,
      setCustomer,
      setPurpose,
      submit,
      refetchAvailability: availability.refetch,
    },
  };
}
