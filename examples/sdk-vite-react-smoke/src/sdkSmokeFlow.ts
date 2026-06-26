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
  date: readViteEnv("VITE_RESERVATION_SMOKE_DATE") || "2026-09-01",
  quantity: Number.parseInt(readViteEnv("VITE_RESERVATION_SMOKE_QUANTITY") || "2", 10),
};

export async function runBrowserSdkSmoke(input: BrowserSmokeFormInput = defaultInput): Promise<BrowserSmokeResult> {
  const liveConfig = readLiveBrowserSmokeConfig();
  const backend = liveConfig ? null : createBrowserFakePlatformFetch();
  const baseUrl = liveConfig?.baseUrl ?? browserSmokeBaseUrl;
  const tenantId = liveConfig?.tenantId ?? browserSmokeTenantId;
  const venueId = liveConfig?.venueId ?? browserSmokeVenueId;
  const serviceId = liveConfig?.serviceId ?? browserSmokeServiceId;
  const accessToken = liveConfig?.accessToken ?? browserSmokeAccessToken;
  const client = createReservationPlatformClient({
    baseUrl,
    tenantId,
    venueId,
    getAccessToken: () => accessToken,
    ...(backend ? { fetch: backend.fetch } : {}),
    timeoutMs: liveConfig ? 10_000 : 1_000,
  });

  const metadata = await client.getMetadata({ correlationId: "vite-metadata" });
  const venues = await client.listVenues(undefined, { correlationId: "vite-venues" });
  const services = await client.listServices({ venue_id: venueId }, { correlationId: "vite-services" });
  const resources = await client.listResources({ service_id: serviceId }, { correlationId: "vite-resources" });
  const availability = await client.listAvailability({
    service_id: serviceId,
    date: input.date,
    quantity: input.quantity,
  }, {
    correlationId: "vite-availability",
  });

  invariant(metadata.api_version === "v1", "metadata did not return v1");
  invariant(venues.venues.length >= 1, "catalog venues were not returned");
  invariant(services.services.some((service) => service.service_id === serviceId), "catalog services were not returned");
  invariant(resources.resources.length >= input.quantity, "catalog resources were not returned");
  invariant(availability.slots[0]?.is_available === true, "availability slot was not available");

  const createInput: CreateReservationInput = {
    service_id: serviceId,
    date: input.date,
    start_time: readViteEnv("VITE_RESERVATION_SMOKE_START_TIME") || "19:00",
    end_time: readViteEnv("VITE_RESERVATION_SMOKE_END_TIME") || "20:30",
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
  if (backend) {
    invariant(backend.observedContexts.every((context) => context.endsWith(`:${browserSmokeAccessToken}`)), "browser token was not used consistently");
  }

  return {
    metadataVersion: metadata.api_version,
    venueName: venues.venues[0].name,
    serviceName: services.services.find((service) => service.service_id === serviceId)?.name ?? services.services[0].name,
    resourceLabels: resources.resources.map((resource) => resource.label),
    availableQuantity: availability.slots[0].available_quantity,
    reservationId: readReservation.reservation_id,
    observedRequestCount: backend?.observedContexts.length ?? 7,
  };
}

function readLiveBrowserSmokeConfig() {
  const baseUrl = readViteEnv("VITE_RESERVATION_PLATFORM_BASE_URL");
  if (!baseUrl) {
    return null;
  }

  return {
    baseUrl,
    tenantId: readViteEnv("VITE_RESERVATION_PLATFORM_TENANT_ID") || browserSmokeTenantId,
    venueId: readViteEnv("VITE_RESERVATION_PLATFORM_VENUE_ID") || browserSmokeVenueId,
    serviceId: readViteEnv("VITE_RESERVATION_PLATFORM_SERVICE_ID") || browserSmokeServiceId,
    accessToken: readViteEnv("VITE_RESERVATION_PLATFORM_ACCESS_TOKEN"),
  };
}

function readViteEnv(name: string) {
  const viteEnv = (import.meta as unknown as { env?: Record<string, unknown> }).env;
  const value = viteEnv?.[name];
  return typeof value === "string" ? value.trim() : "";
}

function invariant(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}
