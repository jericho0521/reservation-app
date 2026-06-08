import { tool } from "@langchain/core/tools";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { MemorySaver } from "@langchain/langgraph";
import { z } from "zod";
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
  BaseMessage,
  ToolMessage,
} from "@langchain/core/messages";
import {
  CHECK_AVAILABILITY_TOOL_NAME,
  GET_SERVICES_TOOL_NAME,
  PREPARE_BOOKING_TOOL_NAME,
  bookingConfirmationActionFromPreparedBookingPayload,
  createDomainGuard,
  createReservationChatTools,
  parsePreparedBookingPayloadJson,
  parsePrepareBookingInput,
  type BookingAction,
  type ChatAction as CoreChatAction,
  type CreateReservationChatToolsInput,
  type ReservationChatTool,
} from "@project-play/reservation-chat-core";
import type { ReservationService } from "@project-play/reservations-core";
import {
  adaptServiceMetadata,
  createSupabaseReservationRepository,
  getLegacyFallbackLabels,
  RESERVATION_SUPABASE_SELECTS,
  type ServiceMetadataRow,
} from "@project-play/reservations-supabase";
import { supabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getEndTime } from "@/lib/availability";
import { getAvailableSeatsWithMaintenance } from "@/lib/reservation-capacity";
import { createOpenRouterChat } from "./models";
import { buildBookingSystemPromptWithContext } from "./prompts";

export type { BookingAction };

type SupabaseRepositoryClient = Parameters<typeof createSupabaseReservationRepository>[0];
type ReservationToolRepository = CreateReservationChatToolsInput["repository"];

interface CreateLangChainReservationToolsOptions {
  descriptors?: ReservationChatTool[];
  repository?: CreateReservationChatToolsInput["repository"];
  listServices?: CreateReservationChatToolsInput["listServices"];
  resolveServiceByName?: CreateReservationChatToolsInput["resolveServiceByName"];
}

interface ServiceRecord {
  id: string;
  name: string;
  description?: string | null;
  total_seats: number;
  resource_kind?: string | null;
  selection_mode?: string | null;
  reservation_policy?: unknown;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LocationDirectionsAction {
  type: "location_directions";
  data: {
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

export type ChatAction = CoreChatAction<LocationDirectionsAction>;

export interface ChatAgentResult {
  content: string;
  action: ChatAction | null;
}

const PROJECT_PLAY_LOCATION: LocationDirectionsAction["data"] = {
  name: "Project Play by CW",
  address: "Project Play By CW, 70, Jalan PJS 11/7, Bandar Sunway, 47500 Subang Jaya, Selangor",
  area: "Bandar Sunway, Subang Jaya",
  coordinates: {
    lat: 3.0660998,
    lng: 101.6026114,
  },
  mapEmbedUrl:
    "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3984.0!2d101.6026114!3d3.0660998!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x31cc4d50f390a0ad%3A0x3a6370b811df68b!2sProject%20Play%20By%20CW!5e0!3m2!1sen!2smy!4v1234567890",
  wazeUrl:
    "https://waze.com/ul?q=Project%20Play%20By%20CW%2C%2070%2C%20Jalan%20PJS%2011%2F7%2C%20Bandar%20Sunway%2C%2047500%20Subang%20Jaya%2C%20Selangor&ll=3.0660998%2C101.6026114&navigate=yes",
  googleMapsUrl:
    "https://www.google.com/maps/search/?api=1&query=Project%20Play%20By%20CW%2C%2070%2C%20Jalan%20PJS%2011%2F7%2C%20Bandar%20Sunway%2C%2047500%20Subang%20Jaya%2C%20Selangor",
};

export const CHAT_DOMAIN_GUARD_RESPONSE =
  "I can help with Project Play bookings, services, availability, pricing, policies, and venue information. What would you like to book or ask about Project Play?";

const blockedChatTopics = [
  /\bwhat\s+(model|llm)\b/i,
  /\bwhich\s+(model|llm)\b/i,
  /\bwho\s+(made|built|created)\s+you\b/i,
  /\bare\s+you\s+(chatgpt|gemini|claude|an?\s+ai)\b/i,
  /\b(prompt|system\s+prompt|instructions?)\b/i,
  /\bignore\s+(previous|all)\s+instructions?\b/i,
];

const allowedChatTopics = [
  /\b(book|booking|reserve|reservation|slot|availability|available|time|date|seat|session)\b/i,
  /\b(service|racing|simulator|playstation|ps5|game|games|equipment|price|pricing|cost|policy|policies|rule|rules|faq|location|open|hours|contact|project\s+play)\b/i,
];

export const getChatDomainGuardResponse = createDomainGuard({
  allowedTopics: allowedChatTopics,
  blockedTopics: blockedChatTopics,
  fallbackResponse: CHAT_DOMAIN_GUARD_RESPONSE,
});

export function getLocationDirectionsAction(message: string): LocationDirectionsAction | null {
  const normalizedMessage = message.trim();

  if (!normalizedMessage) {
    return null;
  }

  const isLocationRequest = /\b(location|located|address|where\s+are\s+you|directions?|direction|map|maps|waze|navigate|navigation|how\s+to\s+go|how\s+do\s+i\s+get\s+there)\b/i.test(normalizedMessage);

  return isLocationRequest
    ? {
        type: "location_directions",
        data: PROJECT_PLAY_LOCATION,
      }
    : null;
}

async function getServiceByName(serviceName: string): Promise<ServiceRecord | null> {
  const { data, error } = await supabase()
    .from("services")
    .select("id, name, description, total_seats, resource_kind, selection_mode, reservation_policy")
    .ilike("name", `%${serviceName}%`)
    .single();

  if (error || !data) {
    return null;
  }

  return data;
}

async function listReservationServices(
  repository: ReservationToolRepository = createChatReservationRepository(),
): Promise<ReservationService[]> {
  const { data, error } = await supabase()
    .from("services")
    .select(RESERVATION_SUPABASE_SELECTS.service);

  if (error) {
    throw new Error(error.message);
  }

  return Promise.all(
    (data ?? []).map(async (service) => {
      const serviceRow = service as ServiceMetadataRow;
      return await repository.getService(serviceRow.id) ?? adaptServiceMetadata(serviceRow);
    })
  );
}

async function resolveReservationServiceByName(
  serviceName: string,
  repository: ReservationToolRepository = createChatReservationRepository(),
): Promise<ReservationService | null> {
  const service = await getServiceByName(serviceName);

  return service ? repository.getService(service.id) : null;
}

function createChatReservationRepository() {
  return createSupabaseReservationRepository(
    supabaseAdmin() as unknown as SupabaseRepositoryClient,
  );
}

async function executeReservationToolDescriptor(
  descriptor: ReturnType<typeof createReservationChatTools>[number],
  input: unknown,
) {
  try {
    return await descriptor.execute(input);
  } catch (error) {
    if (descriptor.name === CHECK_AVAILABILITY_TOOL_NAME) {
      console.error("Failed to check chat booking availability:", error);
      return { error: "Booking availability is temporarily unavailable" };
    }

    if (descriptor.name === GET_SERVICES_TOOL_NAME) {
      return {
        error: error instanceof Error ? error.message : "Services are temporarily unavailable",
      };
    }

    throw error;
  }
}

function getRelaxedLangChainToolSchema(toolName: string) {
  if (toolName === CHECK_AVAILABILITY_TOOL_NAME) {
    return z.object({
      service_name: z.string().optional().describe("Name of the bookable service from get_services"),
      date: z.string().optional().describe("Date in YYYY-MM-DD format"),
    }).passthrough();
  }

  if (toolName === PREPARE_BOOKING_TOOL_NAME) {
    return z.object({
      service_name: z.string().optional().describe("Name of the bookable service from get_services"),
      date: z.string().optional().describe("Date in YYYY-MM-DD format"),
      start_time: z.string().optional().describe("Start time in HH:MM format"),
      seats: z.union([z.number(), z.string()]).optional().describe(
        "Booking quantity, such as seats, stations, rooms, or capacity units",
      ),
      user_name: z.string().optional().describe("Customer name"),
      user_email: z.string().optional().describe("Customer email"),
      user_phone: z.string().optional().describe("Customer phone number"),
    }).passthrough();
  }

  return z.object({}).passthrough();
}

export function createLangChainReservationTools(
  options: CreateLangChainReservationToolsOptions = {},
) {
  const reservationRepository = options.repository ?? createChatReservationRepository();
  const descriptors = options.descriptors ?? createReservationChatTools({
    repository: reservationRepository,
    listServices: options.listServices ?? (() => listReservationServices(reservationRepository)),
    resolveServiceByName:
      options.resolveServiceByName ??
      ((serviceName) => resolveReservationServiceByName(serviceName, reservationRepository)),
    copy: {
      listServicesDescription:
        "Get the current list of bookable services and their capacity/resource reservation metadata",
      checkAvailabilityDescription:
        "Check available time slots for any bookable service on a specific date",
      prepareBookingDescription:
        "Prepare a booking for user confirmation. Call this when you have ALL details: service, date, time, seats, name, email, and phone. This does NOT create the booking yet - it shows a confirmation card to the user.",
    },
    availability: {
      legacyFallbackLabels: getLegacyFallbackLabels,
    },
  });

  return descriptors.map((descriptor) =>
    tool(
      async (input) => executeReservationToolDescriptor(descriptor, input),
      {
        name: descriptor.name,
        description: descriptor.description,
        metadata: {
          descriptorInputSchema: descriptor.inputSchema,
        },
        schema: getRelaxedLangChainToolSchema(descriptor.name),
      }
    )
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getContentText(content: BaseMessage["content"]): string {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((block) => {
      if (typeof block === "string") {
        return block;
      }

      if (isRecord(block) && typeof block.text === "string") {
        return block.text;
      }

      return "";
    })
    .join("");
}

export function extractPreparedBookingAction(messages: BaseMessage[]): BookingAction | null {
  const lastHumanMessageIndex = messages.findLastIndex(
    (message) => message instanceof HumanMessage
  );
  const candidateMessages =
    lastHumanMessageIndex === -1 ? messages : messages.slice(lastHumanMessageIndex + 1);

  for (const message of [...candidateMessages].reverse()) {
    if (ToolMessage.isInstance(message)) {
      const payload = parsePreparedBookingPayloadJson(getContentText(message.content));
      if (payload) {
        return bookingConfirmationActionFromPreparedBookingPayload(payload);
      }
    }

    if (message instanceof AIMessage) {
      const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];

      for (const toolCall of toolCalls) {
        if (toolCall.name === PREPARE_BOOKING_TOOL_NAME && isRecord(toolCall.args)) {
          const payload = parsePrepareBookingInput(toolCall.args);
          if (payload) {
            return {
              type: "booking_confirmation",
              data: {
                service: payload.service_name,
                date: payload.date,
                time: payload.start_time,
                seats: payload.seats,
                name: payload.user_name,
                email: payload.user_email,
                phone: payload.user_phone,
              },
            };
          }
        }
      }
    }
  }

  return null;
}

export async function createBooking(
  serviceName: string,
  date: string,
  startTime: string,
  seats: number,
  userName: string,
  userEmail: string,
  userPhone: string
) {
  const service = await getServiceByName(serviceName);
  if (!service) return { success: false, error: "Service not found" };

  try {
    const bookingClient = supabaseAdmin();
    const { data: existing, error: existingError } = await bookingClient
      .from("bookings")
      .select("seats_booked, seat_labels")
      .eq("service_id", service.id)
      .eq("booking_date", date)
      .eq("start_time", startTime)
      .eq("status", "confirmed");

    if (existingError) throw existingError;

    const { data: maintenanceSeats, error: maintenanceError } = await bookingClient
      .from("service_seat_maintenance")
      .select("seat_label")
      .eq("service_id", service.id)
      .eq("is_active", true);

    if (maintenanceError) throw maintenanceError;

    const maintenanceSeatLabels = (maintenanceSeats || [])
      .map((seat) => seat.seat_label)
      .filter((label): label is string => typeof label === "string");
    const availableSeats = getAvailableSeatsWithMaintenance(
      service.total_seats,
      existing || [],
      maintenanceSeatLabels,
    );
    if (seats > availableSeats) {
      return { success: false, error: `Only ${availableSeats} seats available` };
    }

    const endTime = getEndTime(startTime);

    const { data: booking, error } = await bookingClient
      .from("bookings")
      .insert({
        service_id: service.id,
        user_name: userName,
        user_email: userEmail,
        user_phone: userPhone,
        booking_date: date,
        start_time: startTime,
        end_time: endTime,
        seats_booked: seats,
        status: "confirmed",
        interface_type: "chat",
      })
      .select()
      .single();

    if (error) return { success: false, error: error.message };
    return {
      success: true,
      booking_id: booking.id,
      message: `Booking confirmed! ${seats} seat(s) on ${date} at ${startTime}.`,
    };
  } catch (error) {
    console.error("Failed to create chat booking:", error);
    return { success: false, error: "Booking service is temporarily unavailable" };
  }
}

function createChatAgent() {
  const llm = createOpenRouterChat();

  return createReactAgent({
    llm,
    tools: createLangChainReservationTools(),
    checkpointSaver: new MemorySaver(),
  });
}

let agentInstance: ReturnType<typeof createChatAgent> | null = null;

function getChatAgent() {
  if (!agentInstance) {
    agentInstance = createChatAgent();
  }

  return agentInstance;
}

export async function runChatAgent(
  messages: ChatMessage[],
  context: string,
  threadId: string
): Promise<ChatAgentResult> {
  const agent = getChatAgent();
  const systemPrompt = buildBookingSystemPromptWithContext(context);

  const langChainMessages = [
    new SystemMessage(systemPrompt),
    ...messages.map((m) =>
      m.role === "user"
        ? new HumanMessage(m.content)
        : new AIMessage(m.content)
    ),
  ];

  try {
    const result = await agent.invoke(
      { messages: langChainMessages },
      { configurable: { thread_id: threadId } }
    );

    const resultMessages = result.messages as BaseMessage[];
    const lastAiMessage = [...resultMessages]
      .reverse()
      .find((m) => m instanceof AIMessage && m.content);

    const content =
      typeof lastAiMessage?.content === "string"
        ? lastAiMessage.content
        : "Sorry, I encountered an error.";

    const action = extractPreparedBookingAction(resultMessages);

    return { content, action };
  } catch (error) {
    console.error("Chat agent error:", error);
    const errorText = error instanceof Error ? error.message : String(error);
    const isRateLimit =
      errorText.includes("429") ||
      errorText.includes("quota") ||
      errorText.includes("RESOURCE_EXHAUSTED");
    const userMessage = isRateLimit
      ? "I'm receiving too many requests right now. Please wait a moment and try again."
      : "Something went wrong. Please try again.";

    return { content: userMessage, action: null };
  }
}
