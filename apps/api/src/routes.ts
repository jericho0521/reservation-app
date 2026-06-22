import {
  authorizePlatformContext,
  beginIdempotentMutation,
  cancelReservation,
  commitIdempotentMutation,
  createJsonRequestFingerprint,
  createReservation,
  createResourceMaintenance,
  endResourceMaintenance,
  listAvailability,
  listResourceMaintenance,
  handlePlatformCatalogRequest,
  platformErrorBody,
  prepareAvailabilityQuery,
  prepareLegacyReservationReschedule,
  prepareLegacyReservationCreate,
  prepareReservationCancelInput,
  prepareReservationCreateInput,
  prepareReservationRescheduleInput,
  prepareReservationUpdatePatch,
  readPlatformRequestContext,
  requireIdempotencyKey,
  requirePlatformBearerToken,
  getPlatformMetadata,
  listReservations,
  readReservationById,
  rescheduleReservationWithLegacyPatch,
  updateReservationWithLegacyPatch,
  type AvailabilityRepositoryPort,
  type AuthenticatedPlatformPrincipal,
  type IdempotencyRepository,
  type PlatformCatalogRepository,
  type PlatformRequestContext,
  type PlatformTenantVenueRepository,
  type ReservationCreateRepositoryPort,
  type ReservationMutationRepositoryPort,
  type ReservationReadRepositoryPort,
  type ResourceMaintenanceRepositoryPort,
  validatePlatformTenantVenueContext,
} from "@reservation-platform/api";
import {
  chatConfirmReservationInputSchema,
  chatCreateReservationSessionInputSchema,
  chatMessageInputSchema,
  createResourceMaintenanceInputSchema,
  endResourceMaintenanceInputSchema,
  type ChatConfirmReservationInput,
  type ChatCreateReservationSessionInput,
  type ChatMessageInput,
  type JsonValue,
  type PlatformErrorResponse,
} from "@reservation-platform/contract-types";

import { jsonResponse, platformError, type StandaloneApiRequest, type StandaloneApiResponse } from "./http.js";

export interface StandaloneApiDependencies {
  auth?: StandaloneApiAuthConfig;
  availabilityRepository?: AvailabilityRepositoryPort;
  catalogRepository?: PlatformCatalogRepository;
  chatModule?: StandaloneApiChatModule;
  idempotencyRepository?: IdempotencyRepository;
  reservationCreateRepository?: ReservationCreateRepositoryPort;
  reservationMutationRepository?: ReservationMutationRepositoryPort;
  reservationReadRepository?: ReservationReadRepositoryPort;
  resourceMaintenanceRepository?: ResourceMaintenanceRepositoryPort;
  serviceApiKey?: string;
  tenantVenueRepository?: PlatformTenantVenueRepository;
}

export interface StandaloneApiChatContext {
  requestContext: PlatformRequestContext;
  request: StandaloneApiRequest;
  tenantId?: string;
  venueId?: string;
  correlationId?: string;
  idempotencyKey?: string;
  authorizationHeader?: string;
  bearerToken?: string;
}

export interface StandaloneApiChatRequest<TBody> {
  body: TBody;
  context: StandaloneApiChatContext;
}

export interface StandaloneApiChatSessionRequest<TBody> extends StandaloneApiChatRequest<TBody> {
  chatSessionId: string;
}

export type StandaloneApiChatModuleResponse = {
  status?: number;
  headers?: Record<string, string>;
  body: unknown;
};

export interface StandaloneApiChatModule {
  createReservationSession(
    input: StandaloneApiChatRequest<ChatCreateReservationSessionInput>,
  ): StandaloneApiChatModuleResponse | Promise<StandaloneApiChatModuleResponse>;
  sendMessage(
    input: StandaloneApiChatSessionRequest<ChatMessageInput>,
  ): StandaloneApiChatModuleResponse | Promise<StandaloneApiChatModuleResponse>;
  streamMessage(
    input: StandaloneApiChatSessionRequest<ChatMessageInput>,
  ): StandaloneApiChatModuleResponse | Promise<StandaloneApiChatModuleResponse>;
  confirmReservation(
    input: StandaloneApiChatSessionRequest<ChatConfirmReservationInput>,
  ): StandaloneApiChatModuleResponse | Promise<StandaloneApiChatModuleResponse>;
}

export interface StandaloneApiAuthConfig {
  serviceApiKey?: string;
  verifyBearerToken?: StandaloneApiBearerTokenVerifier;
  requireTenant?: boolean;
  requiredRoles?: readonly string[];
  requiredScopes?: readonly string[];
  servicePrincipalRoles?: readonly string[];
  servicePrincipalScopes?: readonly string[];
}

export interface StandaloneApiBearerTokenVerifierInput {
  token: string;
  requestContext: PlatformRequestContext;
  request: StandaloneApiRequest;
}

export type StandaloneApiBearerTokenVerifierResult =
  | { ok: true; principal: AuthenticatedPlatformPrincipal }
  | { ok: false; status: number; body: PlatformErrorResponse };

export type StandaloneApiBearerTokenVerifier = (
  input: StandaloneApiBearerTokenVerifierInput,
) => StandaloneApiBearerTokenVerifierResult | Promise<StandaloneApiBearerTokenVerifierResult>;

export type StandaloneApiHandler = (request: StandaloneApiRequest) => Promise<StandaloneApiResponse>;

const chatSessionMessagePattern = /^\/v1\/chat\/reservation-sessions\/([^/]+)\/messages$/;
const chatSessionOperationPattern = /^\/v1\/chat\/reservation-sessions\/([^/]+)\/([^/]+)$/;
const safeChatModuleErrorCodes = new Set([
  "bad_request",
  "chat_module_disabled",
  "conflict",
  "forbidden",
  "idempotency_conflict",
  "not_found",
  "rate_limited",
  "unauthorized",
  "validation_failed",
]);

const venuePattern = /^\/v1\/venues\/([^/]+)$/;
const servicePattern = /^\/v1\/services\/([^/]+)$/;
const resourcePattern = /^\/v1\/resources\/([^/]+)$/;
const resourceLayoutPattern = /^\/v1\/resource-layouts\/([^/]+)$/;
const reservationPattern = /^\/v1\/reservations\/([^/]+)$/;
const reservationCancelPattern = /^\/v1\/reservations\/([^/]+)\/cancel$/;
const reservationReschedulePattern = /^\/v1\/reservations\/([^/]+)\/reschedule$/;
const resourceMaintenanceEndPattern = /^\/v1\/resource-maintenance\/([^/]+)\/end$/;
const reservationIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const standaloneHealthBody = {
  status: "ok",
  service: "standalone-api-skeleton",
  api_version: "v1",
  readiness: "alive",
};

export function createStandaloneApiHandler(dependencies: StandaloneApiDependencies = {}): StandaloneApiHandler {
  return async (request) => handleStandaloneApiRequest(request, dependencies);
}

export async function handleStandaloneApiRequest(
  request: StandaloneApiRequest,
  dependencies: StandaloneApiDependencies = {},
): Promise<StandaloneApiResponse> {
  const method = request.method.toUpperCase();
  const url = parseRequestUrl(request.path);
  const path = normalizePath(url.pathname);

  if (method === "GET" && path === "/v1/metadata") {
    return jsonResponse(200, getPlatformMetadata());
  }

  if (method === "GET" && (path === "/healthz" || path === "/v1/health")) {
    return jsonResponse(200, standaloneHealthBody);
  }

  if (isProtectedPlatformDataRoute(method, path)) {
    const authResponse = await authorizeStandalonePlatformDataRequest(request, dependencies);
    if (authResponse) {
      return authResponse;
    }

    if (request.internalPreflight === "auth-only") {
      return { status: 204, headers: {}, body: undefined };
    }
  }

  if (method === "GET" && path === "/v1/availability") {
    return handleAvailabilityRequest(url, dependencies.availabilityRepository);
  }

  if (method === "GET" && path === "/v1/reservations") {
    return handleReservationListRequest(url, dependencies.reservationReadRepository);
  }

  if (method === "GET" && path === "/v1/resource-maintenance") {
    return handleResourceMaintenanceListRequest(url, dependencies.resourceMaintenanceRepository);
  }

  if (method === "POST" && path === "/v1/reservations") {
    return handleReservationCreateRequest(request, dependencies);
  }

  if (method === "POST" && path === "/v1/resource-maintenance") {
    return handleResourceMaintenanceCreateRequest(request, dependencies);
  }

  if (method === "POST") {
    const maintenanceId = resourceMaintenanceEndPattern.exec(path)?.[1];
    if (maintenanceId) {
      return handleResourceMaintenanceEndRequest(
        request,
        decodeURIComponent(maintenanceId),
        dependencies,
      );
    }
  }

  if (method === "PATCH") {
    const reservationId = reservationPattern.exec(path)?.[1];
    if (reservationId) {
      return handleReservationUpdateRequest(request, decodeURIComponent(reservationId), dependencies);
    }
  }

  if (method === "POST") {
    const reservationId = reservationReschedulePattern.exec(path)?.[1];
    if (reservationId) {
      return handleReservationRescheduleRequest(request, decodeURIComponent(reservationId), dependencies);
    }
  }

  if (method === "POST") {
    const reservationId = reservationCancelPattern.exec(path)?.[1];
    if (reservationId) {
      return handleReservationCancelRequest(request, decodeURIComponent(reservationId), dependencies);
    }
  }

  if (method === "GET") {
    const reservationId = reservationPattern.exec(path)?.[1];
    if (reservationId) {
      return handleReservationReadRequest(decodeURIComponent(reservationId), dependencies.reservationReadRepository);
    }
  }

  if (method === "GET") {
    const catalogResponse = await handleCatalogRequest(path, url, dependencies.catalogRepository);
    if (catalogResponse) {
      return catalogResponse;
    }
  }

  if (method === "POST" && path === "/v1/chat/reservation-sessions") {
    return handleChatCreateReservationSessionRequest(request, dependencies.chatModule);
  }

  if (method === "POST" && chatSessionMessagePattern.test(path)) {
    const chatSessionId = chatSessionMessagePattern.exec(path)?.[1];
    return handleChatSendMessageRequest(
      request,
      decodeURIComponent(chatSessionId ?? ""),
      dependencies.chatModule,
    );
  }

  if (method === "POST") {
    const operationMatch = chatSessionOperationPattern.exec(path);
    const chatSessionId = operationMatch?.[1];
    const operation = operationMatch?.[2];
    if (operation === "messages:stream") {
      return handleChatStreamMessageRequest(
        request,
        decodeURIComponent(chatSessionId ?? ""),
        dependencies.chatModule,
      );
    }

    if (operation === "confirm") {
      return handleChatConfirmReservationRequest(
        request,
        decodeURIComponent(chatSessionId ?? ""),
        dependencies.chatModule,
      );
    }
  }

  return platformError(404, "not_found", "Route not found.");
}

async function authorizeStandalonePlatformDataRequest(
  request: StandaloneApiRequest,
  dependencies: StandaloneApiDependencies,
): Promise<StandaloneApiResponse | undefined> {
  const auth = normalizeStandaloneApiAuthConfig(dependencies);
  if (!auth.serviceApiKey && !auth.verifyBearerToken) {
    return undefined;
  }

  const requestContext = readPlatformRequestContext(request.headers ?? {});
  const bearerToken = requirePlatformBearerToken(requestContext);
  if (!bearerToken.ok) {
    return jsonResponse(bearerToken.error.status, { error: bearerToken.error });
  }

  let principal: AuthenticatedPlatformPrincipal;
  if (auth.serviceApiKey && bearerToken.token === auth.serviceApiKey) {
    principal = {
      subjectId: "standalone-api-service",
      tenantIds: requestContext.tenantId === undefined ? [] : [requestContext.tenantId],
      roles: auth.servicePrincipalRoles,
      scopes: auth.servicePrincipalScopes,
    };
  } else if (!auth.verifyBearerToken) {
    return platformError(403, "forbidden", "Invalid service bearer token.");
  } else {
    let verified: StandaloneApiBearerTokenVerifierResult;
    try {
      verified = await auth.verifyBearerToken({
        token: bearerToken.token,
        requestContext,
        request,
      });
    } catch {
      return platformError(500, "internal_error", "Failed to verify bearer token.");
    }

    if (!verified.ok) {
      return jsonResponse(verified.status, verified.body);
    }

    principal = verified.principal;
  }

  const authorization = authorizePlatformContext(principal, requestContext, {
    requireTenant: auth.requireTenant,
    requiredRoles: auth.requiredRoles,
    requiredScopes: auth.requiredScopes,
  });

  if (!authorization.ok) {
    return jsonResponse(authorization.status, authorization.body);
  }

  if (!dependencies.tenantVenueRepository) {
    return undefined;
  }

  const validation = await validatePlatformTenantVenueContext(
    dependencies.tenantVenueRepository,
    authorization.context,
    { requireTenant: auth.requireTenant },
  );

  if (!validation.ok) {
    return jsonResponse(validation.status, validation.body);
  }

  return undefined;
}

function normalizeStandaloneApiAuthConfig(
  dependencies: StandaloneApiDependencies,
): Required<Pick<StandaloneApiAuthConfig, "servicePrincipalRoles" | "servicePrincipalScopes">>
  & Omit<StandaloneApiAuthConfig, "servicePrincipalRoles" | "servicePrincipalScopes"> {
  return {
    serviceApiKey: dependencies.auth?.serviceApiKey ?? dependencies.serviceApiKey,
    verifyBearerToken: dependencies.auth?.verifyBearerToken,
    requireTenant: dependencies.auth?.requireTenant,
    requiredRoles: dependencies.auth?.requiredRoles,
    requiredScopes: dependencies.auth?.requiredScopes,
    servicePrincipalRoles: dependencies.auth?.servicePrincipalRoles ?? ["service"],
    servicePrincipalScopes: dependencies.auth?.servicePrincipalScopes ?? ["platform:service"],
  };
}

function isProtectedPlatformDataRoute(method: string, path: string) {
  if (method === "GET") {
    return path === "/v1/availability"
      || path === "/v1/reservations"
      || reservationPattern.test(path)
      || path === "/v1/resource-maintenance"
      || path === "/v1/venues"
      || venuePattern.test(path)
      || path === "/v1/services"
      || servicePattern.test(path)
      || path === "/v1/resources"
      || resourcePattern.test(path)
      || resourceLayoutPattern.test(path);
  }

  if (method === "POST") {
    return path === "/v1/reservations"
      || reservationCancelPattern.test(path)
      || reservationReschedulePattern.test(path)
      || path === "/v1/resource-maintenance"
      || resourceMaintenanceEndPattern.test(path)
      || isChatReservationSessionRoute(path);
  }

  if (method === "PATCH") {
    return reservationPattern.test(path);
  }

  return false;
}

function isChatReservationSessionRoute(path: string) {
  if (path === "/v1/chat/reservation-sessions") {
    return true;
  }

  const operationMatch = chatSessionOperationPattern.exec(path);
  return chatSessionMessagePattern.test(path)
    || operationMatch?.[2] === "messages:stream"
    || operationMatch?.[2] === "confirm";
}

async function handleAvailabilityRequest(
  url: URL,
  repository: AvailabilityRepositoryPort | undefined,
): Promise<StandaloneApiResponse> {
  const preparedQuery = prepareAvailabilityQuery(url);
  if (preparedQuery.status !== 200) {
    return jsonResponse(preparedQuery.status, preparedQuery.error);
  }

  if (!repository) {
    return platformError(503, "bad_request", "Availability repository is not configured.");
  }

  const result = await listAvailability({
    repository,
    query: url,
  });

  return jsonResponse(result.status, result.body);
}

async function handleReservationCreateRequest(
  request: StandaloneApiRequest,
  dependencies: StandaloneApiDependencies,
): Promise<StandaloneApiResponse> {
  const requiredKey = requireIdempotencyKey(getHeader(request.headers, "Idempotency-Key"));
  if (!requiredKey.ok) {
    return jsonResponse(requiredKey.status, requiredKey.body);
  }

  const preparedInput = prepareReservationCreateInput(request.body);
  if (preparedInput.status !== 200) {
    return jsonResponse(preparedInput.status, preparedInput.error);
  }

  const preparedLegacy = prepareLegacyReservationCreate(preparedInput.input);

  if (!dependencies.idempotencyRepository) {
    return platformError(503, "bad_request", "Idempotency repository is not configured.");
  }

  if (!dependencies.reservationCreateRepository) {
    return platformError(503, "bad_request", "Reservation create repository is not configured.");
  }

  const begin = await beginIdempotentMutation(dependencies.idempotencyRepository, {
    key: requiredKey.key,
    tenantId: getHeader(request.headers, "X-Reservation-Tenant-Id"),
    method: request.method,
    path: "/v1/reservations",
    fingerprint: createJsonRequestFingerprint(preparedInput.input as unknown as JsonValue),
  });

  if (begin.action === "replay" || begin.action === "reject") {
    return jsonResponse(begin.status, begin.body);
  }

  const result = await createReservation({
    repository: dependencies.reservationCreateRepository,
    legacyInput: preparedLegacy.legacyInput,
  });

  if (result.status >= 200 && result.status < 300) {
    await commitIdempotentMutation(dependencies.idempotencyRepository, begin.token, {
      status: result.status,
      body: result.body,
    });
  }

  return jsonResponse(result.status, result.body);
}

async function handleChatCreateReservationSessionRequest(
  request: StandaloneApiRequest,
  chatModule: StandaloneApiChatModule | undefined,
): Promise<StandaloneApiResponse> {
  if (!chatModule) {
    return chatModuleDisabled();
  }

  const body = readChatBody(
    request.body,
    chatCreateReservationSessionInputSchema,
    "Invalid chat request body.",
  );
  if (!body.ok) {
    return body.response;
  }

  return invokeChatModule(() => chatModule.createReservationSession({
    body: body.value,
    context: createChatContext(request),
  }));
}

async function handleChatSendMessageRequest(
  request: StandaloneApiRequest,
  chatSessionId: string,
  chatModule: StandaloneApiChatModule | undefined,
): Promise<StandaloneApiResponse> {
  if (!chatModule) {
    return chatModuleDisabled();
  }

  const body = readChatBody(
    request.body,
    chatMessageInputSchema,
    "Invalid chat message data.",
  );
  if (!body.ok) {
    return body.response;
  }

  return invokeChatModule(() => chatModule.sendMessage({
    chatSessionId,
    body: body.value,
    context: createChatContext(request),
  }));
}

async function handleChatStreamMessageRequest(
  request: StandaloneApiRequest,
  chatSessionId: string,
  chatModule: StandaloneApiChatModule | undefined,
): Promise<StandaloneApiResponse> {
  if (!chatModule) {
    return chatModuleDisabled();
  }

  const body = readChatBody(
    request.body,
    chatMessageInputSchema,
    "Invalid chat message data.",
  );
  if (!body.ok) {
    return body.response;
  }

  return invokeChatModule(() => chatModule.streamMessage({
    chatSessionId,
    body: body.value,
    context: createChatContext(request),
  }));
}

async function handleChatConfirmReservationRequest(
  request: StandaloneApiRequest,
  chatSessionId: string,
  chatModule: StandaloneApiChatModule | undefined,
): Promise<StandaloneApiResponse> {
  if (!chatModule) {
    return chatModuleDisabled();
  }

  const body = readChatBody(
    request.body,
    chatConfirmReservationInputSchema,
    "Invalid chat request body.",
  );
  if (!body.ok) {
    return body.response;
  }

  return invokeChatModule(() => chatModule.confirmReservation({
    chatSessionId,
    body: body.value,
    context: createChatContext(request),
  }));
}

async function handleResourceMaintenanceListRequest(
  url: URL,
  repository: ResourceMaintenanceRepositoryPort | undefined,
): Promise<StandaloneApiResponse> {
  const serviceId = url.searchParams.get("service_id")?.trim();
  if (!serviceId) {
    return jsonResponse(400, platformErrorBody("validation_failed", "service_id is required.", 400));
  }

  if (!repository) {
    return platformError(503, "bad_request", "Resource maintenance repository is not configured.");
  }

  const result = await listResourceMaintenance({
    repository,
    serviceId,
  });

  return jsonResponse(result.status, result.body);
}

async function handleResourceMaintenanceCreateRequest(
  request: StandaloneApiRequest,
  dependencies: StandaloneApiDependencies,
): Promise<StandaloneApiResponse> {
  const requiredKey = requireIdempotencyKey(getHeader(request.headers, "Idempotency-Key"));
  if (!requiredKey.ok) {
    return jsonResponse(requiredKey.status, requiredKey.body);
  }

  const parsedBody = createResourceMaintenanceInputSchema.safeParse(request.body ?? {});
  if (!parsedBody.success) {
    return jsonResponse(400, platformErrorBody("validation_failed", "Invalid resource maintenance data.", 400));
  }

  return handleIdempotentResourceMaintenanceMutation({
    request,
    dependencies,
    idempotencyKey: requiredKey.key,
    path: "/v1/resource-maintenance",
    fingerprintValue: parsedBody.data as unknown as JsonValue,
    mutate: (repository) => createResourceMaintenance({
      repository,
      data: parsedBody.data,
    }),
  });
}

async function handleResourceMaintenanceEndRequest(
  request: StandaloneApiRequest,
  maintenanceId: string,
  dependencies: StandaloneApiDependencies,
): Promise<StandaloneApiResponse> {
  const requiredKey = requireIdempotencyKey(getHeader(request.headers, "Idempotency-Key"));
  if (!requiredKey.ok) {
    return jsonResponse(requiredKey.status, requiredKey.body);
  }

  const parsedBody = endResourceMaintenanceInputSchema.safeParse(request.body ?? {});
  if (!parsedBody.success) {
    return jsonResponse(400, platformErrorBody("validation_failed", "Invalid resource maintenance end data.", 400));
  }

  return handleIdempotentResourceMaintenanceMutation({
    request,
    dependencies,
    idempotencyKey: requiredKey.key,
    path: `/v1/resource-maintenance/${maintenanceId}/end`,
    fingerprintValue: parsedBody.data as unknown as JsonValue,
    mutate: (repository) => endResourceMaintenance({
      repository,
      maintenanceId,
      data: parsedBody.data,
    }),
  });
}

async function handleIdempotentResourceMaintenanceMutation(input: {
  request: StandaloneApiRequest;
  dependencies: StandaloneApiDependencies;
  idempotencyKey: string;
  path: string;
  fingerprintValue: JsonValue;
  mutate: (repository: ResourceMaintenanceRepositoryPort) => Promise<{
    status: number;
    body: unknown;
  }>;
}): Promise<StandaloneApiResponse> {
  if (!input.dependencies.idempotencyRepository) {
    return platformError(503, "bad_request", "Idempotency repository is not configured.");
  }

  if (!input.dependencies.resourceMaintenanceRepository) {
    return platformError(503, "bad_request", "Resource maintenance repository is not configured.");
  }

  const begin = await beginIdempotentMutation(input.dependencies.idempotencyRepository, {
    key: input.idempotencyKey,
    tenantId: getHeader(input.request.headers, "X-Reservation-Tenant-Id"),
    method: input.request.method,
    path: input.path,
    fingerprint: createJsonRequestFingerprint(input.fingerprintValue),
  });

  if (begin.action === "replay" || begin.action === "reject") {
    return jsonResponse(begin.status, begin.body);
  }

  const result = await input.mutate(input.dependencies.resourceMaintenanceRepository);

  if (result.status >= 200 && result.status < 300) {
    await commitIdempotentMutation(input.dependencies.idempotencyRepository, begin.token, {
      status: result.status,
      body: result.body,
    });
  }

  return jsonResponse(result.status, result.body);
}

async function handleReservationUpdateRequest(
  request: StandaloneApiRequest,
  reservationId: string,
  dependencies: StandaloneApiDependencies,
): Promise<StandaloneApiResponse> {
  const requiredKey = requireIdempotencyKey(getHeader(request.headers, "Idempotency-Key"));
  if (!requiredKey.ok) {
    return jsonResponse(requiredKey.status, requiredKey.body);
  }

  const invalidId = validateReservationMutationId(reservationId, "Invalid booking update data");
  if (invalidId) {
    return invalidId;
  }

  const preparedPatch = prepareReservationUpdatePatch(request.body);
  if (preparedPatch.status !== 200) {
    return jsonResponse(preparedPatch.status, preparedPatch.error);
  }

  return handleIdempotentReservationMutation({
    request,
    dependencies,
    idempotencyKey: requiredKey.key,
    path: `/v1/reservations/${reservationId}`,
    fingerprintValue: preparedPatch.legacyPatch as unknown as JsonValue,
    mutate: (repository) => updateReservationWithLegacyPatch({
      repository,
      reservationId,
      legacyPatch: preparedPatch.legacyPatch,
    }),
  });
}

async function handleReservationRescheduleRequest(
  request: StandaloneApiRequest,
  reservationId: string,
  dependencies: StandaloneApiDependencies,
): Promise<StandaloneApiResponse> {
  const requiredKey = requireIdempotencyKey(getHeader(request.headers, "Idempotency-Key"));
  if (!requiredKey.ok) {
    return jsonResponse(requiredKey.status, requiredKey.body);
  }

  const invalidId = validateReservationMutationId(reservationId, "Invalid booking update data");
  if (invalidId) {
    return invalidId;
  }

  const preparedInput = prepareReservationRescheduleInput(request.body);
  if (preparedInput.status !== 200) {
    return jsonResponse(preparedInput.status, preparedInput.error);
  }

  const preparedLegacy = prepareLegacyReservationReschedule(preparedInput.input);

  return handleIdempotentReservationMutation({
    request,
    dependencies,
    idempotencyKey: requiredKey.key,
    path: `/v1/reservations/${reservationId}/reschedule`,
    fingerprintValue: preparedInput.input as unknown as JsonValue,
    mutate: (repository) => rescheduleReservationWithLegacyPatch({
      repository,
      reservationId,
      legacyPatch: preparedLegacy.legacyInput,
    }),
  });
}

async function handleReservationCancelRequest(
  request: StandaloneApiRequest,
  reservationId: string,
  dependencies: StandaloneApiDependencies,
): Promise<StandaloneApiResponse> {
  const requiredKey = requireIdempotencyKey(getHeader(request.headers, "Idempotency-Key"));
  if (!requiredKey.ok) {
    return jsonResponse(requiredKey.status, requiredKey.body);
  }

  const invalidId = validateReservationMutationId(reservationId, "Invalid booking id");
  if (invalidId) {
    return invalidId;
  }

  const preparedInput = prepareReservationCancelInput(request.body ?? {});
  if (preparedInput.status !== 200) {
    return jsonResponse(preparedInput.status, preparedInput.error);
  }

  return handleIdempotentReservationMutation({
    request,
    dependencies,
    idempotencyKey: requiredKey.key,
    path: `/v1/reservations/${reservationId}/cancel`,
    fingerprintValue: preparedInput.input as unknown as JsonValue,
    mutate: (repository) => cancelReservation({
      repository,
      reservationId,
    }),
  });
}

async function handleIdempotentReservationMutation(input: {
  request: StandaloneApiRequest;
  dependencies: StandaloneApiDependencies;
  idempotencyKey: string;
  path: string;
  fingerprintValue: JsonValue;
  mutate: (repository: ReservationMutationRepositoryPort) => Promise<{
    status: number;
    body: unknown;
  }>;
}): Promise<StandaloneApiResponse> {
  if (!input.dependencies.idempotencyRepository) {
    return platformError(503, "bad_request", "Idempotency repository is not configured.");
  }

  if (!input.dependencies.reservationMutationRepository) {
    return platformError(503, "bad_request", "Reservation mutation repository is not configured.");
  }

  const begin = await beginIdempotentMutation(input.dependencies.idempotencyRepository, {
    key: input.idempotencyKey,
    tenantId: getHeader(input.request.headers, "X-Reservation-Tenant-Id"),
    method: input.request.method,
    path: input.path,
    fingerprint: createJsonRequestFingerprint(input.fingerprintValue),
  });

  if (begin.action === "replay" || begin.action === "reject") {
    return jsonResponse(begin.status, begin.body);
  }

  const result = await input.mutate(input.dependencies.reservationMutationRepository);

  if (result.status >= 200 && result.status < 300) {
    await commitIdempotentMutation(input.dependencies.idempotencyRepository, begin.token, {
      status: result.status,
      body: result.body,
    });
  }

  return jsonResponse(result.status, result.body);
}

async function handleReservationListRequest(
  url: URL,
  repository: ReservationReadRepositoryPort | undefined,
): Promise<StandaloneApiResponse> {
  if (!repository) {
    return platformError(503, "bad_request", "Reservation read repository is not configured.");
  }

  const result = await listReservations({
    repository,
    search: url.searchParams.get("search"),
  });

  return jsonResponse(result.status, result.body);
}

async function handleReservationReadRequest(
  reservationId: string,
  repository: ReservationReadRepositoryPort | undefined,
): Promise<StandaloneApiResponse> {
  if (!repository) {
    const validationResult = await readReservationById({
      repository: reservationReadRepositoryNotConfigured(),
      reservationId,
    });
    if (validationResult.status === 400) {
      return jsonResponse(validationResult.status, validationResult.body);
    }

    return platformError(503, "bad_request", "Reservation read repository is not configured.");
  }

  const result = await readReservationById({
    repository,
    reservationId,
  });

  return jsonResponse(result.status, result.body);
}

async function handleCatalogRequest(
  path: string,
  url: URL,
  repository: PlatformCatalogRepository | undefined,
): Promise<StandaloneApiResponse | undefined> {
  const result = await handlePlatformCatalogRequest({
    path,
    repository,
    url,
  });
  if (!result) {
    return undefined;
  }

  return jsonResponse(result.status, result.body);
}

function reservationReadRepositoryNotConfigured(): ReservationReadRepositoryPort {
  return {
    async listReservations() {
      return { data: null, error: new Error("Reservation read repository is not configured.") };
    },
    async readReservationById() {
      return { data: null, error: new Error("Reservation read repository is not configured.") };
    },
  };
}

function validateReservationMutationId(reservationId: string, message: string): StandaloneApiResponse | undefined {
  if (reservationIdPattern.test(reservationId)) {
    return undefined;
  }

  return jsonResponse(400, platformErrorBody("validation_failed", message, 400, [{
    code: "invalid_string",
    validation: "uuid",
    message: "Invalid uuid",
    path: [],
    received: reservationId,
  }]));
}

function parseRequestUrl(path: string) {
  return new URL(path, "http://standalone-api.local");
}

function normalizePath(path: string) {
  const normalized = path.replace(/\/+$/, "");
  return normalized === "" ? "/" : normalized;
}

function getHeader(
  headers: StandaloneApiRequest["headers"],
  name: string,
) {
  if (!headers) {
    return undefined;
  }

  const normalizedName = name.toLowerCase();
  for (const [headerName, value] of Object.entries(headers)) {
    if (headerName.toLowerCase() === normalizedName) {
      return Array.isArray(value) ? value[0] : value;
    }
  }

  return undefined;
}

function createChatContext(request: StandaloneApiRequest): StandaloneApiChatContext {
  const requestContext = readPlatformRequestContext(request.headers ?? {});

  return {
    requestContext,
    request,
    ...(requestContext.tenantId === undefined ? {} : { tenantId: requestContext.tenantId }),
    ...(requestContext.venueId === undefined ? {} : { venueId: requestContext.venueId }),
    ...(requestContext.correlationId === undefined ? {} : { correlationId: requestContext.correlationId }),
    ...(requestContext.idempotencyKey === undefined ? {} : { idempotencyKey: requestContext.idempotencyKey }),
    ...(requestContext.authorizationHeader === undefined ? {} : {
      authorizationHeader: requestContext.authorizationHeader,
    }),
    ...(requestContext.bearerToken === undefined ? {} : { bearerToken: requestContext.bearerToken }),
  };
}

async function invokeChatModule(
  action: () => StandaloneApiChatModuleResponse | Promise<StandaloneApiChatModuleResponse>,
): Promise<StandaloneApiResponse> {
  try {
    return normalizeChatModuleResponse(await action());
  } catch {
    return platformError(500, "internal_error", "Chat module request failed.");
  }
}

function normalizeChatModuleResponse(response: StandaloneApiChatModuleResponse): StandaloneApiResponse {
  const status = isValidHttpStatus(response.status) ? response.status : 200;
  if (status >= 400) {
    return normalizeChatModuleErrorResponse(status, response.body);
  }

  return {
    status,
    headers: mergeResponseHeaders(
      { "content-type": "application/json; charset=utf-8" },
      response.headers,
    ),
    body: response.body,
  };
}

function mergeResponseHeaders(
  baseHeaders: Record<string, string>,
  overrideHeaders: Record<string, string> | undefined,
) {
  const headers = { ...baseHeaders };

  for (const [name, value] of Object.entries(overrideHeaders ?? {})) {
    const existingName = Object.keys(headers).find((headerName) => headerName.toLowerCase() === name.toLowerCase());
    if (existingName) {
      delete headers[existingName];
    }

    headers[name] = value;
  }

  return headers;
}

function normalizeChatModuleErrorResponse(status: number, body: unknown): StandaloneApiResponse {
  if (status >= 500) {
    return platformError(500, "internal_error", "Chat module request failed.");
  }

  const safeBody = readSafePlatformErrorResponseBody(body, status);
  if (safeBody) {
    return jsonResponse(status, safeBody);
  }

  return platformError(status, "bad_request", "Chat module request failed.");
}

function readSafePlatformErrorResponseBody(body: unknown, status: number): PlatformErrorResponse | undefined {
  if (!isPlainRecord(body) || !isPlainRecord(body.error)) {
    return undefined;
  }

  const error = body.error;
  if (
    typeof error.code !== "string"
    || typeof error.message !== "string"
    || error.status !== status
    || !safeChatModuleErrorCodes.has(error.code)
  ) {
    return undefined;
  }

  const safeError: PlatformErrorResponse["error"] = {
    code: error.code,
    message: error.message,
    status,
  };

  if (typeof error.request_id === "string") {
    safeError.request_id = error.request_id;
  }
  if (typeof error.retryable === "boolean") {
    safeError.retryable = error.retryable;
  }
  if (typeof error.documentation_url === "string") {
    safeError.documentation_url = error.documentation_url;
  }
  const safeIdempotency = readSafePlatformErrorIdempotency(error.idempotency);
  if (safeIdempotency) {
    safeError.idempotency = safeIdempotency;
  }

  return { error: safeError };
}

function readSafePlatformErrorIdempotency(
  value: unknown,
): NonNullable<PlatformErrorResponse["error"]["idempotency"]> | undefined {
  if (!isPlainRecord(value)) {
    return undefined;
  }

  if (value.key !== undefined && typeof value.key !== "string") {
    return undefined;
  }
  if (
    value.status !== undefined
    && value.status !== "created"
    && value.status !== "replayed"
    && value.status !== "rejected"
  ) {
    return undefined;
  }
  if (value.replayed !== undefined && typeof value.replayed !== "boolean") {
    return undefined;
  }

  const safe: NonNullable<PlatformErrorResponse["error"]["idempotency"]> = {};
  if (typeof value.key === "string") {
    safe.key = value.key;
  }
  if (
    value.status === "created"
    || value.status === "replayed"
    || value.status === "rejected"
  ) {
    safe.status = value.status;
  }
  if (typeof value.replayed === "boolean") {
    safe.replayed = value.replayed;
  }

  return safe;
}

type ChatBodySchema<TBody> = {
  safeParse(value: unknown): { success: true; data: TBody } | { success: false };
};

function readChatBody<TBody>(
  body: unknown,
  schema: ChatBodySchema<TBody>,
  message: string,
):
  | { ok: true; value: TBody }
  | { ok: false; response: StandaloneApiResponse } {
  const value = body ?? {};
  if (!isPlainRecord(value)) {
    return {
      ok: false,
      response: jsonResponse(400, platformErrorBody("validation_failed", "Invalid chat request body.", 400)),
    };
  }

  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      response: jsonResponse(400, platformErrorBody("validation_failed", message, 400)),
    };
  }

  return { ok: true, value: parsed.data };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isValidHttpStatus(status: number | undefined): status is number {
  return typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599;
}

function chatModuleDisabled(): StandaloneApiResponse {
  return platformError(404, "chat_module_disabled", "Chat module is disabled.");
}
