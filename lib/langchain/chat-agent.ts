import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { MemorySaver } from "@langchain/langgraph";
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
  BaseMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { supabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getEndTime, generateTimeSlots } from "@/lib/availability";
import { getAvailableSeats } from "@/lib/reservation-capacity";
import { createOpenRouterChat } from "./models";
import { buildBookingSystemPromptWithContext } from "./prompts";

interface ServiceRecord {
  id: string;
  name: string;
  total_seats: number;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface BookingAction {
  type: "booking_confirmation" | "booking_success";
  data: {
    service: string;
    date: string;
    time: string;
    seats: number;
    name: string;
    email: string;
  };
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

export type ChatAction = BookingAction | LocationDirectionsAction;

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

export function getChatDomainGuardResponse(message: string): string | null {
  const normalizedMessage = message.trim();

  if (!normalizedMessage) {
    return null;
  }

  const isAllowedTopic = allowedChatTopics.some((pattern) => pattern.test(normalizedMessage));
  if (isAllowedTopic) {
    return null;
  }

  return blockedChatTopics.some((pattern) => pattern.test(normalizedMessage))
    ? CHAT_DOMAIN_GUARD_RESPONSE
    : null;
}

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
    .select("id, name, total_seats")
    .ilike("name", `%${serviceName}%`)
    .single();

  if (error || !data) {
    return null;
  }

  return data;
}

const getServicesTool = tool(
  async () => {
    const { data, error } = await supabase()
      .from("services")
      .select("id, name, description, total_seats");
    if (error) return { error: error.message };
    return { services: data };
  },
  {
    name: "get_services",
    description: "Get list of available services",
    schema: z.object({}),
  }
);

const checkAvailabilityTool = tool(
  async ({ service_name, date }) => {
    try {
      const service = await getServiceByName(service_name);
      if (!service) return { error: "Service not found" };

      const { data: bookings } = await supabaseAdmin()
        .from("bookings")
        .select("start_time, seats_booked")
        .eq("service_id", service.id)
        .eq("booking_date", date)
        .eq("status", "confirmed");

      const slots = generateTimeSlots(service.total_seats, bookings || [])
        .filter((slot) => slot.is_available)
        .map((slot) => ({
          time: slot.start_time,
          available_seats: slot.available_seats,
        }));

      return {
        service_name: service.name,
        service_id: service.id,
        date,
        total_seats: service.total_seats,
        available_slots: slots,
      };
    } catch (error) {
      console.error("Failed to check chat booking availability:", error);
      return { error: "Booking availability is temporarily unavailable" };
    }
  },
  {
    name: "check_availability",
    description: "Check available time slots for a service on a specific date",
    schema: z.object({
      service_name: z.string().describe("Name of the service (Racing Simulator or Playstation 5)"),
      date: z.string().describe("Date in YYYY-MM-DD format"),
    }),
  }
);

const prepareBookingTool = tool(
  async ({ service_name, date, start_time, seats, user_name, user_email }) => {
    return {
      ready_for_confirmation: true,
      service_name,
      date,
      start_time,
      seats,
      user_name,
      user_email,
    };
  },
  {
    name: "prepare_booking",
    description:
      "Prepare a booking for user confirmation. Call this when you have ALL details: service, date, time, seats, name, email. This does NOT create the booking yet - it shows a confirmation card to the user.",
    schema: z.object({
      service_name: z.string().describe("Name of the service (Racing Simulator or Playstation 5)"),
      date: z.string().describe("Date in YYYY-MM-DD format"),
      start_time: z.string().describe("Start time in HH:MM format"),
      seats: z.number().describe("Number of seats"),
      user_name: z.string().describe("Customer name"),
      user_email: z.string().describe("Customer email"),
    }),
  }
);

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

function parseJsonRecord(content: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(content);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function bookingActionFromArgs(args: Record<string, unknown>): BookingAction | null {
  const service = args.service_name;
  const date = args.date;
  const time = args.start_time;
  const seats = args.seats;
  const name = args.user_name;
  const email = args.user_email;

  if (
    typeof service !== "string" ||
    typeof date !== "string" ||
    typeof time !== "string" ||
    typeof seats !== "number" ||
    typeof name !== "string" ||
    typeof email !== "string"
  ) {
    return null;
  }

  return {
    type: "booking_confirmation",
    data: {
      service,
      date,
      time,
      seats,
      name,
      email,
    },
  };
}

export function extractPreparedBookingAction(messages: BaseMessage[]): BookingAction | null {
  const lastHumanMessageIndex = messages.findLastIndex(
    (message) => message instanceof HumanMessage
  );
  const candidateMessages =
    lastHumanMessageIndex === -1 ? messages : messages.slice(lastHumanMessageIndex + 1);

  for (const message of [...candidateMessages].reverse()) {
    if (ToolMessage.isInstance(message)) {
      const payload = parseJsonRecord(getContentText(message.content));
      if (payload?.ready_for_confirmation === true) {
        return bookingActionFromArgs(payload);
      }
    }

    if (message instanceof AIMessage) {
      const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];

      for (const toolCall of toolCalls) {
        if (toolCall.name === "prepare_booking" && isRecord(toolCall.args)) {
          const action = bookingActionFromArgs(toolCall.args);
          if (action) {
            return action;
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
  userEmail: string
) {
  const service = await getServiceByName(serviceName);
  if (!service) return { success: false, error: "Service not found" };

  try {
    const bookingClient = supabaseAdmin();
    const { data: existing } = await bookingClient
      .from("bookings")
      .select("seats_booked")
      .eq("service_id", service.id)
      .eq("booking_date", date)
      .eq("start_time", startTime)
      .eq("status", "confirmed");

    const availableSeats = getAvailableSeats(service.total_seats, existing || []);
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
    tools: [getServicesTool, checkAvailabilityTool, prepareBookingTool],
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
