import {
  createIdempotencyKey,
  createReservationPlatformClient,
  type CreateReservationInput,
} from "@reservation-platform/sdk";
import {
  browserSmokeAccessToken,
  browserSmokeBaseUrl,
  browserSmokeServiceId,
  browserSmokeTenantId,
  browserSmokeVenueId,
  createBrowserFakePlatformFetch,
} from "./fakePlatformFetch";

export interface BrowserSmokeFormInput {
  customerName: string;
  customerEmail: string;
  date: string;
  quantity: number;
}

export interface BrowserSmokeResult {
  metadataVersion: string;
  venueName: string;
  serviceName: string;
  resourceLabels: string[];
  availableQuantity: number;
  reservationId: string;
  observedRequestCount: number;
}

const defaultInput: BrowserSmokeFormInput = {
  customerName: "Vite React Consumer",
  customerEmail: "vite-react@example.com",
  date: "2026-09-01",
  quantity: 2,
};

export async function runBrowserSdkSmoke(input: BrowserSmokeFormInput = defaultInput): Promise<BrowserSmokeResult> {
  const backend = createBrowserFakePlatformFetch();
  const client = createReservationPlatformClient({
    baseUrl: browserSmokeBaseUrl,
    tenantId: browserSmokeTenantId,
    venueId: browserSmokeVenueId,
    getAccessToken: () => browserSmokeAccessToken,
    fetch: backend.fetch,
    timeoutMs: 1_000,
  });

  const metadata = await client.getMetadata({ correlationId: "vite-metadata" });
  const venues = await client.listVenues(undefined, { correlationId: "vite-venues" });
  const services = await client.listServices({ venue_id: browserSmokeVenueId }, { correlationId: "vite-services" });
  const resources = await client.listResources({ service_id: browserSmokeServiceId }, { correlationId: "vite-resources" });
  const availability = await client.listAvailability({
    service_id: browserSmokeServiceId,
    date: input.date,
    quantity: input.quantity,
  }, {
    correlationId: "vite-availability",
  });

  invariant(metadata.api_version === "v1", "metadata did not return v1");
  invariant(venues.venues.length === 1, "catalog venues were not returned");
  invariant(services.services.length === 1, "catalog services were not returned");
  invariant(resources.resources.length >= input.quantity, "catalog resources were not returned");
  invariant(availability.slots[0]?.is_available === true, "availability slot was not available");

  const createInput: CreateReservationInput = {
    service_id: browserSmokeServiceId,
    date: input.date,
    start_time: "19:00",
    end_time: "20:30",
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
    source: "vite-react-smoke",
  };

  const reservation = await client.createReservation(createInput, {
    idempotencyKey: createIdempotencyKey("vite-react-create"),
    correlationId: "vite-create",
  });
  const readReservation = await client.getReservation(reservation.reservation_id, {
    correlationId: "vite-read",
  });

  invariant(readReservation.reservation_id === reservation.reservation_id, "reservation read did not match create");
  invariant(readReservation.customer?.email === input.customerEmail, "reservation customer did not round-trip");
  invariant(backend.observedContexts.every((context) => context.endsWith(`:${browserSmokeAccessToken}`)), "browser token was not used consistently");

  return {
    metadataVersion: metadata.api_version,
    venueName: venues.venues[0].name,
    serviceName: services.services[0].name,
    resourceLabels: resources.resources.map((resource) => resource.label),
    availableQuantity: availability.slots[0].available_quantity,
    reservationId: readReservation.reservation_id,
    observedRequestCount: backend.observedContexts.length,
  };
}

function invariant(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}
