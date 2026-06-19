import {
  createReservationPlatformClient,
  type CreateReservationInput,
  type ReservationResponse,
} from "@reservation-platform/sdk";
import {
  createNextFakePlatformFetch,
  nextSmokeAccessToken,
  nextSmokeBaseUrl,
  nextSmokeServiceId,
  nextSmokeTenantId,
  nextSmokeVenueId,
  type NextFakePlatform,
} from "./fakePlatformFetch";

export interface NextSmokeFormInput {
  customerName: string;
  customerEmail: string;
  date: string;
  quantity: number;
}

export interface NextSmokeResult {
  metadataVersion: string;
  venueName: string;
  serviceName: string;
  availableQuantity: number;
  reservationId: string;
  directParity: "passed";
  observedRequestCount: number;
}

const defaultInput: NextSmokeFormInput = {
  customerName: "Next External Consumer",
  customerEmail: "next-external@example.com",
  date: "2026-10-01",
  quantity: 2,
};

export async function runNextSdkSmoke(input: NextSmokeFormInput = defaultInput): Promise<NextSmokeResult> {
  const backend = createNextFakePlatformFetch();
  const client = createReservationPlatformClient({
    baseUrl: nextSmokeBaseUrl,
    tenantId: nextSmokeTenantId,
    venueId: nextSmokeVenueId,
    getAccessToken: () => nextSmokeAccessToken,
    fetch: backend.fetch,
    timeoutMs: 1_000,
  });

  const metadata = await client.getMetadata({ correlationId: "next-metadata" });
  const venues = await client.listVenues(undefined, { correlationId: "next-venues" });
  const services = await client.listServices({ venue_id: nextSmokeVenueId }, { correlationId: "next-services" });
  const resources = await client.listResources({ service_id: nextSmokeServiceId }, { correlationId: "next-resources" });
  const availability = await client.listAvailability({
    service_id: nextSmokeServiceId,
    date: input.date,
    quantity: input.quantity,
  }, {
    correlationId: "next-availability",
  });

  invariant(metadata.api_version === "v1", "metadata did not return v1");
  invariant(venues.venues.length === 1, "catalog venues were not returned");
  invariant(services.services.length === 1, "catalog services were not returned");
  invariant(resources.resources.length >= input.quantity, "catalog resources were not returned");
  invariant(availability.slots[0]?.is_available === true, "availability slot was not available");

  const createInput: CreateReservationInput = {
    service_id: nextSmokeServiceId,
    date: input.date,
    start_time: "18:30",
    end_time: "20:00",
    quantity: input.quantity,
    reservation_items: resources.resources.slice(0, input.quantity).map((resource) => ({
      resource_id: resource.resource_id,
      resource_label: resource.label,
      quantity: 1,
    })),
    customer: {
      name: input.customerName,
      email: input.customerEmail,
    },
    source: "next-external-smoke",
  };

  const idempotencyKey = "next-external-create";
  const reservation = await client.createReservation(createInput, {
    idempotencyKey,
    correlationId: "next-create",
  });
  const readReservation = await client.getReservation(reservation.reservation_id, {
    correlationId: "next-read",
  });

  invariant(readReservation.reservation_id === reservation.reservation_id, "reservation read did not match create");
  invariant(readReservation.customer?.email === input.customerEmail, "reservation customer did not round-trip");

  const rawCreateReplay = await rawPlatformJson<ReservationResponse>(
    backend,
    "/v1/reservations",
    {
      method: "POST",
      body: createInput,
      idempotencyKey,
      correlationId: "next-raw-create-replay",
    },
  );
  const rawRead = await rawPlatformJson<ReservationResponse>(
    backend,
    `/v1/reservations/${reservation.reservation_id}`,
    {
      method: "GET",
      correlationId: "next-raw-read",
    },
  );

  assertDeepEqual(rawCreateReplay, reservation, "raw create replay did not match SDK create");
  assertDeepEqual(rawRead, readReservation, "raw read did not match SDK read");
  invariant(
    backend.observedContexts.every((context) => context.endsWith(`:${nextSmokeAccessToken}`)),
    "browser-safe token was not used consistently",
  );

  return {
    metadataVersion: metadata.api_version,
    venueName: venues.venues[0].name,
    serviceName: services.services[0].name,
    availableQuantity: availability.slots[0].available_quantity,
    reservationId: readReservation.reservation_id,
    directParity: "passed",
    observedRequestCount: backend.observedContexts.length,
  };
}

async function rawPlatformJson<T>(
  backend: NextFakePlatform,
  path: string,
  options: {
    method: "GET" | "POST";
    body?: unknown;
    idempotencyKey?: string;
    correlationId: string;
  },
): Promise<T> {
  const headers = new Headers({
    Authorization: `Bearer ${nextSmokeAccessToken}`,
    "X-Reservation-Tenant-Id": nextSmokeTenantId,
    "X-Reservation-Venue-Id": nextSmokeVenueId,
    "X-Correlation-Id": options.correlationId,
  });

  let body: string | undefined;
  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(options.body);
  }
  if (options.idempotencyKey) {
    headers.set("Idempotency-Key", options.idempotencyKey);
  }

  const response = await backend.fetch(new URL(path, nextSmokeBaseUrl), {
    method: options.method,
    headers,
    body,
  });

  if (!response.ok) {
    throw new Error(`Raw platform request failed with status ${response.status}: ${await response.text()}`);
  }

  return await response.json() as T;
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(message);
  }
}

function invariant(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}
