import type {
  AvailabilityResponse,
  CreateReservationInput,
  ListResourcesResponse,
  ListServicesResponse,
  ListVenuesResponse,
  MetadataResponse,
  PlatformErrorBody,
  ReservationResponse,
} from "@reservation-platform/contract-types";

export const nextSmokeBaseUrl = "https://reservation-platform-next-smoke.test";
export const nextSmokeTenantId = "tenant_next_external";
export const nextSmokeVenueId = "venue_next_external";
export const nextSmokeAccessToken = "public-next-demo-token";
export const nextSmokeServiceId = "private-dining-room";

export interface NextFakePlatform {
  fetch: typeof fetch;
  observedContexts: string[];
}

export function createNextFakePlatformFetch(): NextFakePlatform {
  const reservations = new Map<string, ReservationResponse>();
  const idempotency = new Map<string, { body: string; response: ReservationResponse }>();
  const observedContexts: string[] = [];

  const fetchImpl: typeof fetch = async (input, init) => {
    const request = await normalizeRequest(input, init);
    const url = new URL(request.url);
    invariant(url.origin === new URL(nextSmokeBaseUrl).origin, "unexpected smoke backend origin");

    const headers = request.headers;
    const authorization = headers.get("Authorization") ?? "";
    const tenantId = headers.get("X-Reservation-Tenant-Id");
    const venueId = headers.get("X-Reservation-Venue-Id");
    const correlationId = headers.get("X-Correlation-Id") ?? "";
    const token = authorization.replace(/^Bearer\s+/i, "");

    observedContexts.push([tenantId, venueId, correlationId, token].join(":"));

    if (authorization !== `Bearer ${nextSmokeAccessToken}`) {
      return platformError("unauthorized", "Next demo token is missing or invalid.", 401);
    }
    if (tenantId !== nextSmokeTenantId || venueId !== nextSmokeVenueId) {
      return platformError("bad_request", "Next smoke tenant or venue header is missing.", 400);
    }

    if (url.pathname === "/v1/metadata" && request.method === "GET") {
      const response: MetadataResponse = {
        api_version: "v1",
        modules: ["reservations", "catalog", "resource_maintenance"],
        compatibility: {
          sdk_versions: ["0.0.0"],
          contract_types_versions: ["0.0.0"],
        },
      };
      return jsonResponse(response);
    }

    if (url.pathname === "/v1/venues" && request.method === "GET") {
      const response: ListVenuesResponse = {
        venues: [{
          venue_id: nextSmokeVenueId,
          tenant_id: nextSmokeTenantId,
          name: "Next External Smoke Venue",
          timezone: "Asia/Kuala_Lumpur",
        }],
      };
      return jsonResponse(response);
    }

    if (url.pathname === "/v1/services" && request.method === "GET") {
      invariant(url.searchParams.get("venue_id") === nextSmokeVenueId, "services query missed venue");
      const response: ListServicesResponse = {
        services: [{
          service_id: nextSmokeServiceId,
          venue_id: nextSmokeVenueId,
          name: "Next SDK Private Dining",
          duration_minutes: 90,
          total_quantity: 4,
          resource_kind: "seat",
          resource_strategy: "assigned_resource",
        }],
      };
      return jsonResponse(response);
    }

    if (url.pathname === "/v1/resources" && request.method === "GET") {
      invariant(url.searchParams.get("service_id") === nextSmokeServiceId, "resources query missed service");
      const response: ListResourcesResponse = {
        resources: [
          { resource_id: "next-seat-a1", service_id: nextSmokeServiceId, label: "A1", kind: "seat", is_active: true, capacity: 1 },
          { resource_id: "next-seat-a2", service_id: nextSmokeServiceId, label: "A2", kind: "seat", is_active: true, capacity: 1 },
          { resource_id: "next-seat-b1", service_id: nextSmokeServiceId, label: "B1", kind: "seat", is_active: true, capacity: 1 },
          { resource_id: "next-seat-b2", service_id: nextSmokeServiceId, label: "B2", kind: "seat", is_active: true, capacity: 1 },
        ],
      };
      return jsonResponse(response);
    }

    if (url.pathname === "/v1/availability" && request.method === "GET") {
      invariant(url.searchParams.get("service_id") === nextSmokeServiceId, "availability query missed service");
      invariant(Boolean(url.searchParams.get("date")), "availability query missed date");
      const response: AvailabilityResponse = {
        total_quantity: 4,
        resource_kind: "seat",
        resource_strategy: "assigned_resource",
        resources: [
          { resource_id: "next-seat-a1", service_id: nextSmokeServiceId, label: "A1", kind: "seat", is_active: true, capacity: 1 },
          { resource_id: "next-seat-a2", service_id: nextSmokeServiceId, label: "A2", kind: "seat", is_active: true, capacity: 1 },
        ],
        slots: [{
          start_time: "18:30",
          end_time: "20:00",
          available_quantity: 4,
          is_available: true,
          resource_ids: ["next-seat-a1", "next-seat-a2"],
          taken_resource_labels: [],
          maintenance_resource_labels: [],
        }],
      };
      return jsonResponse(response);
    }

    if (url.pathname === "/v1/reservations" && request.method === "POST") {
      const idempotencyKey = headers.get("Idempotency-Key");
      if (!idempotencyKey) {
        return platformError("missing_idempotency_key", "Missing idempotency key.", 400);
      }

      const body = request.body;
      const replay = idempotency.get(idempotencyKey);
      if (replay) {
        if (replay.body !== body) {
          return platformError(
            "idempotency_key_reused_with_different_request",
            "Idempotency key was reused with a different request.",
            409,
          );
        }
        return jsonResponse(replay.response);
      }

      const inputBody = JSON.parse(body) as CreateReservationInput;
      const reservation: ReservationResponse = {
        reservation_id: `res_next_external_${reservations.size + 1}`,
        tenant_id: nextSmokeTenantId,
        venue_id: nextSmokeVenueId,
        service_id: inputBody.service_id,
        status: "confirmed",
        date: inputBody.date,
        start_time: inputBody.start_time,
        end_time: inputBody.end_time,
        quantity: inputBody.quantity,
        reservation_items: inputBody.reservation_items,
        customer: inputBody.customer,
      };
      reservations.set(reservation.reservation_id, reservation);
      idempotency.set(idempotencyKey, { body, response: reservation });
      return jsonResponse(reservation, 201);
    }

    const reservationMatch = url.pathname.match(/^\/v1\/reservations\/([^/]+)$/);
    if (reservationMatch && request.method === "GET") {
      const reservation = reservations.get(reservationMatch[1]);
      if (!reservation) {
        return platformError("reservation_not_found", "Reservation was not found.", 404, "req_next_missing");
      }
      return jsonResponse(reservation);
    }

    return platformError("not_found", `Unhandled Next smoke route ${url.pathname}.`, 404);
  };

  return { fetch: fetchImpl, observedContexts };
}

async function normalizeRequest(input: RequestInfo | URL, init?: RequestInit) {
  const requestInput = input instanceof Request ? input : undefined;
  const url = requestInput?.url ?? String(input);
  const method = init?.method ?? requestInput?.method ?? "GET";
  const headers = new Headers(requestInput?.headers);

  if (init?.headers) {
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  }

  let body = init?.body === undefined ? undefined : String(init.body);
  if (body === undefined && requestInput && !["GET", "HEAD"].includes(method.toUpperCase())) {
    body = await requestInput.clone().text();
  }

  return {
    url,
    method: method.toUpperCase(),
    headers,
    body: body ?? "",
  };
}

function platformError(code: PlatformErrorBody["code"], message: string, status: number, requestId = "req_next_smoke") {
  return jsonResponse({
    error: {
      code,
      message,
      status,
      request_id: requestId,
    },
  }, status);
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function invariant(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}
