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
import { getEndTime, generateTimeSlots } from "@/lib/availability";
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

export interface ChatAgentResult {
  content: string;
  action: BookingAction | null;
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
    const service = await getServiceByName(service_name);
    if (!service) return { error: "Service not found" };

    const { data: bookings } = await supabase()
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

  const { data: existing } = await supabase()
    .from("bookings")
    .select("seats_booked")
    .eq("service_id", service.id)
    .eq("booking_date", date)
    .eq("start_time", startTime)
    .eq("status", "confirmed");

  const bookedSeats = (existing || []).reduce((sum, b) => sum + b.seats_booked, 0);
  if (seats > service.total_seats - bookedSeats) {
    return { success: false, error: `Only ${service.total_seats - bookedSeats} seats available` };
  }

  const endTime = getEndTime(startTime);

  const { data: booking, error } = await supabase()
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
