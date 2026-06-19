import type {
  ChatCreateReservationSessionInput,
  ChatConfirmReservationInput,
  ChatMessageInput as PlatformChatMessageInput,
} from "@reservation-platform/contract-types";

export type ReservationChatMode = "local" | "platform";

export interface ReservationChatContext {
  tenantId?: string;
  venueId?: string;
  correlationId?: string;
}

export interface ChatHistoryMessageInput {
  role: "user" | "assistant";
  content: string;
}

export interface LegacyChatAction {
  type: "booking_confirmation" | "booking_success" | "location_directions";
  data: unknown;
}

export interface LegacyChatResponse {
  content: string;
  threadId?: string;
  action?: LegacyChatAction | null;
  confirmed?: boolean;
}

export interface BookingConfirmationInput {
  service: string;
  date: string;
  time: string;
  seats: number;
  name: string;
  email: string;
  phone: string;
  reservation_intent_id?: string;
}

export interface SendChatMessageInput {
  messages: ChatHistoryMessageInput[];
  threadId?: string;
}

export interface ConfirmChatBookingInput {
  confirmBooking: BookingConfirmationInput;
  threadId?: string;
}

interface PlatformChatEnvelope {
  chat_session_id?: string;
  data?: {
    chat_session_id?: string;
    content?: string;
    actions?: unknown;
    action?: unknown;
    reservation?: {
      status?: unknown;
    };
  };
  content?: string;
  threadId?: string;
  action?: unknown;
  actions?: unknown;
  reservation?: {
    status?: unknown;
  };
}

interface PlatformChatSessionResult {
  chatSessionId?: string;
  disabled: boolean;
}

const CHAT_DISABLED_CONTENT =
  "Chat booking through the reservation platform is not enabled yet. Please use the booking form for now, or try again later.";

export function getReservationChatMode(
  env?: Pick<NodeJS.ProcessEnv, "NEXT_PUBLIC_RESERVATION_CHAT_MODE">,
): ReservationChatMode {
  const configuredMode = env
    ? env.NEXT_PUBLIC_RESERVATION_CHAT_MODE
    : process.env.NEXT_PUBLIC_RESERVATION_CHAT_MODE;

  return configuredMode === "platform" ? "platform" : "local";
}

export function getReservationChatContext(
  env?: Pick<
    NodeJS.ProcessEnv,
    "NEXT_PUBLIC_RESERVATION_TENANT_ID" | "NEXT_PUBLIC_RESERVATION_VENUE_ID"
  >,
): ReservationChatContext {
  const tenantId = env
    ? env.NEXT_PUBLIC_RESERVATION_TENANT_ID
    : process.env.NEXT_PUBLIC_RESERVATION_TENANT_ID;
  const venueId = env
    ? env.NEXT_PUBLIC_RESERVATION_VENUE_ID
    : process.env.NEXT_PUBLIC_RESERVATION_VENUE_ID;

  return {
    tenantId: tenantId || undefined,
    venueId: venueId || undefined,
  };
}

export async function sendChatMessage(
  input: SendChatMessageInput,
  mode: ReservationChatMode = getReservationChatMode(),
): Promise<LegacyChatResponse> {
  if (mode === "local") {
    return fetchLocalChat({
      messages: input.messages,
      threadId: input.threadId,
    }, "Failed to get chat response");
  }

  return sendPlatformChatMessage(input);
}

export async function confirmChatBooking(
  input: ConfirmChatBookingInput,
  mode: ReservationChatMode = getReservationChatMode(),
): Promise<LegacyChatResponse> {
  if (mode === "local") {
    const response = await fetchLocalChat({
      messages: [],
      confirmBooking: input.confirmBooking,
      threadId: input.threadId,
    }, "Failed to confirm booking");
    return {
      ...response,
      confirmed: response.action?.type === "booking_success",
    };
  }

  return confirmPlatformChatBooking(input);
}

async function fetchLocalChat(body: unknown, fallbackError: string) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, fallbackError));
  }

  return payload as LegacyChatResponse;
}

async function sendPlatformChatMessage(input: SendChatMessageInput): Promise<LegacyChatResponse> {
  const latestUserMessage = [...input.messages].reverse().find((message) => message.role === "user");
  const message = latestUserMessage?.content ?? "";
  const session = input.threadId
    ? { chatSessionId: input.threadId, disabled: false }
    : await createPlatformChatSession();

  if (session.disabled) {
    return disabledChatResponse(session.chatSessionId);
  }

  const chatSessionId = session.chatSessionId;
  const body: PlatformChatMessageInput = { message };

  const response = await fetch(
    `/api/v1/chat/reservation-sessions/${encodeURIComponent(chatSessionId)}/messages`,
    withPlatformChatContext({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": createIdempotencyKey("chat-message"),
      },
      body: JSON.stringify(body),
    }),
  );
  const payload = await readJson(response);

  if (isChatModuleDisabled(response, payload)) {
    return disabledChatResponse(chatSessionId);
  }
  if (!response.ok) {
    throw new Error(getErrorMessage(payload, "Failed to get chat response"));
  }

  return platformEnvelopeToLegacyResponse(payload, chatSessionId);
}

async function confirmPlatformChatBooking(input: ConfirmChatBookingInput): Promise<LegacyChatResponse> {
  const session = input.threadId
    ? { chatSessionId: input.threadId, disabled: false }
    : await createPlatformChatSession();

  if (session.disabled) {
    return disabledChatResponse(session.chatSessionId);
  }

  const chatSessionId = session.chatSessionId;
  const reservationIntentId = input.confirmBooking.reservation_intent_id;

  if (!reservationIntentId) {
    return {
      content: "I need a prepared reservation before I can confirm this booking. Please ask me to prepare the booking again, then confirm the new card.",
      threadId: chatSessionId,
      action: null,
      confirmed: false,
    };
  }

  const body: ChatConfirmReservationInput = {
    reservation_intent_id: reservationIntentId,
  };
  const response = await fetch(
    `/api/v1/chat/reservation-sessions/${encodeURIComponent(chatSessionId)}/confirm`,
    withPlatformChatContext({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": createIdempotencyKey("chat-confirm"),
      },
      body: JSON.stringify(body),
    }),
  );
  const payload = await readJson(response);

  if (isChatModuleDisabled(response, payload)) {
    return disabledChatResponse(chatSessionId);
  }
  if (!response.ok) {
    throw new Error(getErrorMessage(payload, "Failed to confirm booking"));
  }

  const legacyResponse = platformEnvelopeToLegacyResponse(payload, chatSessionId);
  return {
    ...legacyResponse,
    confirmed: isConfirmedPlatformReservation(payload),
  };
}

async function createPlatformChatSession(): Promise<PlatformChatSessionResult> {
  const context = getReservationChatContext();
  const body: ChatCreateReservationSessionInput = {
    metadata: {
      source: "current-frontend",
    },
  };

  if (context.venueId) {
    body.venue_id = context.venueId;
  }

  const response = await fetch("/api/v1/chat/reservation-sessions", withPlatformChatContext({
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": createIdempotencyKey("chat-session"),
    },
    body: JSON.stringify(body),
  }, context));
  const payload = await readJson(response);

  if (isChatModuleDisabled(response, payload)) {
    return {
      chatSessionId: createLocalThreadId("chat-disabled"),
      disabled: true,
    };
  }
  if (!response.ok) {
    throw new Error(getErrorMessage(payload, "Failed to start chat session"));
  }

  const envelope = payload as PlatformChatEnvelope;
  const sessionId = envelope.chat_session_id ?? envelope.data?.chat_session_id;
  if (typeof sessionId !== "string" || !sessionId.trim()) {
    throw new Error("Failed to start chat session: missing chat_session_id");
  }

  return {
    chatSessionId: sessionId,
    disabled: false,
  };
}

function platformEnvelopeToLegacyResponse(payload: unknown, fallbackThreadId: string): LegacyChatResponse {
  const envelope = isRecord(payload) ? payload : {};
  const data = isRecord(envelope.data) ? envelope.data : {};
  const envelopeActions = Array.isArray(envelope.actions) ? envelope.actions : [];
  const dataActions = Array.isArray(data.actions) ? data.actions : [];
  const action = getFirstSafeLegacyAction(
    envelope.action,
    data.action,
    ...envelopeActions,
    ...dataActions,
  );

  return {
    content: readString(envelope.content) ?? readString(data.content) ?? "",
    threadId: readString(envelope.threadId)
      ?? readString(envelope.chat_session_id)
      ?? readString(data.chat_session_id)
      ?? fallbackThreadId,
    action,
  };
}

function disabledChatResponse(threadId?: string): LegacyChatResponse {
  return {
    content: CHAT_DISABLED_CONTENT,
    threadId,
    action: null,
    confirmed: false,
  };
}

function getFirstSafeLegacyAction(...actions: unknown[]) {
  for (const action of actions) {
    const translatedAction = translatePlatformAction(action);
    if (translatedAction) {
      return translatedAction;
    }
  }

  return null;
}

function translatePlatformAction(action: unknown): LegacyChatAction | null {
  if (!isRecord(action) || typeof action.type !== "string") {
    return null;
  }

  const actionData = isRecord(action.data) ? action.data : action;

  if (action.type === "booking_confirmation") {
    const bookingData = readBookingData(actionData);
    return isConfirmableBookingData(bookingData) ? { type: "booking_confirmation", data: bookingData } : null;
  }

  if (action.type === "location_directions") {
    const locationDirections = readLocationDirectionsData(actionData);
    return locationDirections ? { type: "location_directions", data: locationDirections } : null;
  }

  if (action.type === "prepare_reservation" || action.type === "reservation_confirmation") {
    const bookingData = readBookingData(actionData);
    return isConfirmableBookingData(bookingData) ? { type: "booking_confirmation", data: bookingData } : null;
  }

  return null;
}

function readBookingData(data: Record<string, unknown>): BookingConfirmationInput | null {
  const customer = isRecord(data.customer) ? data.customer : {};
  const reservationIntentId = readString(data.reservation_intent_id);
  const startAt = typeof data.start_at === "string" ? data.start_at : undefined;
  const inferredDate = startAt?.split("T")[0];
  const inferredTime = startAt?.includes("T") ? startAt.split("T")[1]?.slice(0, 5) : undefined;
  const service = readString(data.service) ?? readString(data.service_name);
  const date = readString(data.date) ?? inferredDate;
  const time = readString(data.time) ?? readString(data.start_time) ?? inferredTime;
  const seats = readNumber(data.seats) ?? readNumber(data.quantity);
  const name = readString(data.name) ?? readString(customer.name);
  const email = readString(data.email) ?? readString(customer.email);
  const phone = readString(data.phone) ?? readString(customer.phone);

  if (seats !== undefined && seats <= 0) {
    return null;
  }

  if (!service || !date || !time || !seats || !name || !email || !phone) {
    return null;
  }

  const bookingData: BookingConfirmationInput = {
    service,
    date,
    time,
    seats,
    name,
    email,
    phone,
  };

  if (reservationIntentId) {
    bookingData.reservation_intent_id = reservationIntentId;
  }

  return bookingData;
}

function isConfirmableBookingData(
  bookingData: BookingConfirmationInput | null,
): bookingData is BookingConfirmationInput & { reservation_intent_id: string } {
  return Boolean(bookingData?.reservation_intent_id);
}

function readLocationDirectionsData(data: Record<string, unknown>) {
  const coordinates = isRecord(data.coordinates) ? data.coordinates : null;
  const mapEmbedUrl = readSafeUrl(data.mapEmbedUrl, {
    allowedHosts: ["google.com"],
    pathPrefix: "/maps/embed",
  });
  const wazeUrl = readSafeUrl(data.wazeUrl, {
    allowedHosts: ["waze.com"],
  });
  const googleMapsUrl = readSafeUrl(data.googleMapsUrl, {
    allowedHosts: ["google.com"],
    pathPrefix: "/maps",
  });
  const locationDirections = {
    name: readString(data.name),
    address: readString(data.address),
    area: readString(data.area),
    coordinates: coordinates
      ? {
          lat: readNumber(coordinates.lat),
          lng: readNumber(coordinates.lng),
        }
      : null,
    mapEmbedUrl,
    wazeUrl,
    googleMapsUrl,
  };

  if (
    !locationDirections.name ||
    !locationDirections.address ||
    !locationDirections.area ||
    !locationDirections.coordinates ||
    locationDirections.coordinates.lat === undefined ||
    locationDirections.coordinates.lng === undefined ||
    !locationDirections.mapEmbedUrl ||
    !locationDirections.wazeUrl ||
    !locationDirections.googleMapsUrl
  ) {
    return null;
  }

  return locationDirections as {
    name: string;
    address: string;
    area: string;
    coordinates: {
      lat: number;
      lng: number;
    };
    mapEmbedUrl: string;
    wazeUrl: string;
    googleMapsUrl: string;
  };
}

function readSafeUrl(
  value: unknown,
  options: { allowedHosts: string[]; pathPrefix?: string },
) {
  const rawUrl = readString(value);
  if (!rawUrl) {
    return undefined;
  }

  try {
    const url = new URL(rawUrl);
    const hostname = url.hostname.toLowerCase();
    const isAllowedHost = options.allowedHosts.some(
      (host) => hostname === host || hostname.endsWith(`.${host}`),
    );
    if (url.protocol !== "https:" || !isAllowedHost) {
      return undefined;
    }
    if (options.pathPrefix && !url.pathname.startsWith(options.pathPrefix)) {
      return undefined;
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

function isConfirmedPlatformReservation(payload: unknown) {
  if (!isRecord(payload)) {
    return false;
  }

  const reservation = isRecord(payload.reservation)
    ? payload.reservation
    : isRecord(payload.data) && isRecord(payload.data.reservation)
      ? payload.data.reservation
      : null;

  return reservation?.status === "confirmed";
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

async function readJson(response: Response) {
  try {
    return await response.json() as unknown;
  } catch {
    return null;
  }
}

function getErrorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object" || !("error" in payload)) {
    return fallback;
  }

  const error = (payload as { error: unknown }).error;
  if (typeof error === "string") {
    return error;
  }
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === "string" ? message : fallback;
  }

  return fallback;
}

function isChatModuleDisabled(response: Response, payload: unknown) {
  if (response.status !== 404 || !payload || typeof payload !== "object" || !("error" in payload)) {
    return false;
  }

  const error = (payload as { error: unknown }).error;
  return Boolean(error && typeof error === "object" && (error as { code?: unknown }).code === "chat_module_disabled");
}

function withPlatformChatContext(init: RequestInit, context: ReservationChatContext = getReservationChatContext()): RequestInit {
  const headers = new Headers(init.headers);

  if (context.tenantId) {
    headers.set("X-Reservation-Tenant-Id", context.tenantId);
  }
  if (context.venueId) {
    headers.set("X-Reservation-Venue-Id", context.venueId);
  }
  headers.set("X-Correlation-Id", context.correlationId ?? createIdempotencyKey("frontend"));

  return {
    ...init,
    headers,
  };
}

function createIdempotencyKey(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createLocalThreadId(prefix: string) {
  return createIdempotencyKey(prefix);
}
