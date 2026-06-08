import {
  generateAvailabilityTimeSlots,
  type GenerateAvailabilityOptions,
  type ReservationRepository,
  type ReservationService,
  type ReservationTimeSlot,
} from "@project-play/reservations-core";
import {
  CHECK_AVAILABILITY_TOOL_NAME,
  GET_SERVICES_TOOL_NAME,
  PREPARE_BOOKING_TOOL_NAME,
  checkAvailabilityToolJsonSchema,
  getServicesToolJsonSchema,
  prepareBookingToolJsonSchema,
  type CheckAvailabilityToolInput,
  type PrepareBookingToolInput,
} from "./tool-schemas.js";
import {
  parsePrepareBookingInput,
  type PreparedBookingPayload,
} from "./prepared-booking.js";

export type ReservationChatToolInputSchema = Record<string, unknown>;

export interface ReservationChatTool<TInput = unknown, TResult = unknown> {
  name: string;
  description: string;
  inputSchema: ReservationChatToolInputSchema;
  execute(input: TInput): Promise<TResult> | TResult;
}

export interface ReservationChatClock {
  now(): Date;
}

export interface ReservationChatToolCopy {
  listServicesDescription?: string;
  checkAvailabilityDescription?: string;
  prepareBookingDescription?: string;
}

export interface ServiceSummary {
  id: string;
  name: string;
  description?: string;
  total_capacity: number;
  resource_kind: ReservationService["resource_kind"];
  selection_mode: ReservationService["selection_mode"];
  reservation_policy: ReservationService["policy"];
  resource_labels?: string[];
}

export interface ListServicesToolResult {
  services: ServiceSummary[];
}

export interface AvailabilitySlotSummary {
  time: string;
  start_time: string;
  end_time: string;
  available_quantity: number;
  available_seats: number;
  is_available: boolean;
  taken_resource_labels: string[];
  maintenance_resource_labels: string[];
}

export interface CheckAvailabilityToolResult {
  service_name: string;
  service_id: string;
  date: string;
  current_date: string;
  total_capacity: number;
  resource_kind: ReservationService["resource_kind"];
  selection_mode: ReservationService["selection_mode"];
  reservation_policy: ReservationService["policy"];
  available_slots: AvailabilitySlotSummary[];
}

export interface ReservationChatToolErrorResult {
  error: string;
}

export interface ReservationChatKnowledgeInput {
  query: string;
}

export interface ReservationChatKnowledgeToolConfig<TResult = unknown> {
  name?: string;
  description?: string;
  inputSchema?: ReservationChatToolInputSchema;
  retrieve(input: ReservationChatKnowledgeInput): Promise<TResult> | TResult;
}

export type ReservationChatAvailabilityOptions =
  Omit<GenerateAvailabilityOptions, "legacyFallbackLabels"> & {
    includeUnavailableSlots?: boolean;
    legacyFallbackLabels?:
      | string[]
      | ((service: ReservationService) => string[]);
  };

export interface CreateReservationChatToolsInput {
  repository: ReservationRepository;
  listServices: () => Promise<ReservationService[]> | ReservationService[];
  resolveServiceByName: (serviceName: string) => Promise<ReservationService | null> | ReservationService | null;
  clock?: ReservationChatClock;
  copy?: ReservationChatToolCopy;
  availability?: ReservationChatAvailabilityOptions;
  knowledgeTool?: ReservationChatKnowledgeToolConfig;
  customTools?: ReservationChatTool[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidDateString(value: unknown): value is string {
  const normalizedValue = typeof value === "string" ? value.trim() : value;

  if (!isNonEmptyString(normalizedValue) || !/^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)) {
    return false;
  }

  const [yearText, monthText, dayText] = normalizedValue.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function serviceSummaryFromService(service: ReservationService): ServiceSummary {
  const resourceLabels = service.resources
    ?.filter((resource) => resource.is_active)
    .map((resource) => resource.label);

  return {
    id: service.id,
    name: service.name,
    description: service.description,
    total_capacity: service.total_seats,
    resource_kind: service.resource_kind,
    selection_mode: service.selection_mode,
    reservation_policy: service.policy,
    ...(resourceLabels && resourceLabels.length > 0
      ? { resource_labels: resourceLabels }
      : {}),
  };
}

function availabilitySlotSummaryFromSlot(
  slot: ReservationTimeSlot,
): AvailabilitySlotSummary {
  return {
    time: slot.start_time,
    start_time: slot.start_time,
    end_time: slot.end_time,
    available_quantity: slot.available_quantity,
    available_seats: slot.available_seats,
    is_available: slot.is_available,
    taken_resource_labels: slot.taken_resource_labels,
    maintenance_resource_labels: slot.maintenance_resource_labels,
  };
}

function currentDate(clock: ReservationChatClock) {
  return clock.now().toISOString().slice(0, 10);
}

function legacyFallbackLabelsForService(
  options: ReservationChatAvailabilityOptions,
  service: ReservationService,
) {
  return typeof options.legacyFallbackLabels === "function"
    ? options.legacyFallbackLabels(service)
    : options.legacyFallbackLabels;
}

function parseCheckAvailabilityInput(
  input: unknown,
): CheckAvailabilityToolInput | null {
  if (!isRecord(input)) {
    return null;
  }

  const serviceName = input.service_name;
  const date = input.date;

  if (!isNonEmptyString(serviceName) || !isValidDateString(date)) {
    return null;
  }

  return {
    service_name: serviceName.trim(),
    date: date.trim(),
  };
}

function parseKnowledgeInput(input: unknown): ReservationChatKnowledgeInput | null {
  if (!isRecord(input) || !isNonEmptyString(input.query)) {
    return null;
  }

  return {
    query: input.query.trim(),
  };
}

function createKnowledgeTool(
  config: ReservationChatKnowledgeToolConfig,
): ReservationChatTool<unknown, unknown> {
  return {
    name: config.name ?? "search_knowledge",
    description:
      config.description ??
      "Search host-provided booking, service, pricing, policy, and venue knowledge.",
    inputSchema:
      config.inputSchema ?? {
        type: "object",
        properties: {
          query: { type: "string" },
        },
        required: ["query"],
        additionalProperties: false,
      },
    execute(input) {
      const toolInput = parseKnowledgeInput(input);

      if (!toolInput) {
        return { error: "Invalid knowledge search request" };
      }

      return config.retrieve(toolInput);
    },
  };
}

function assertUniqueToolNames(tools: ReservationChatTool[]) {
  const seenToolNames = new Set<string>();

  for (const tool of tools) {
    if (seenToolNames.has(tool.name)) {
      throw new Error(`Duplicate reservation chat tool name: ${tool.name}`);
    }

    seenToolNames.add(tool.name);
  }
}

export function createReservationChatTools(
  input: CreateReservationChatToolsInput,
): ReservationChatTool[] {
  const clock = input.clock ?? { now: () => new Date() };
  const copy = input.copy ?? {};
  const availabilityOptions = input.availability ?? {};

  const tools: ReservationChatTool[] = [
    {
      name: GET_SERVICES_TOOL_NAME,
      description:
        copy.listServicesDescription ??
        "Get the current list of bookable services and their capacity/resource reservation metadata.",
      inputSchema: getServicesToolJsonSchema,
      async execute(): Promise<ListServicesToolResult> {
        const services = await input.listServices();

        return {
          services: services.map(serviceSummaryFromService),
        };
      },
    },
    {
      name: CHECK_AVAILABILITY_TOOL_NAME,
      description:
        copy.checkAvailabilityDescription ??
        "Check available time slots for a bookable service on a specific date.",
      inputSchema: checkAvailabilityToolJsonSchema,
      async execute(
        rawInput: unknown,
      ): Promise<CheckAvailabilityToolResult | ReservationChatToolErrorResult> {
        const toolInput = parseCheckAvailabilityInput(rawInput);

        if (!toolInput) {
          return { error: "Invalid availability request" };
        }

        const service = await input.resolveServiceByName(toolInput.service_name);

        if (!service) {
          return { error: "Service not found" };
        }

        const [reservations, maintenanceResourceLabels] = await Promise.all([
          input.repository.getConfirmedReservations({
            serviceId: service.id,
            bookingDate: toolInput.date,
          }),
          input.repository.getMaintenanceResourceLabels(service.id),
        ]);
        const slots = generateAvailabilityTimeSlots(service, reservations, {
          ...availabilityOptions,
          legacyFallbackLabels: legacyFallbackLabelsForService(
            availabilityOptions,
            service,
          ),
          maintenanceResourceLabels,
        })
          .filter((slot) => availabilityOptions.includeUnavailableSlots || slot.is_available)
          .map(availabilitySlotSummaryFromSlot);

        return {
          service_name: service.name,
          service_id: service.id,
          date: toolInput.date,
          current_date: currentDate(clock),
          total_capacity: service.total_seats,
          resource_kind: service.resource_kind,
          selection_mode: service.selection_mode,
          reservation_policy: service.policy,
          available_slots: slots,
        };
      },
    },
    {
      name: PREPARE_BOOKING_TOOL_NAME,
      description:
        copy.prepareBookingDescription ??
        "Prepare a booking for host confirmation. This does not create the booking.",
      inputSchema: prepareBookingToolJsonSchema,
      execute(
        rawInput: unknown,
      ): PreparedBookingPayload | ReservationChatToolErrorResult {
        const toolInput = parsePrepareBookingInput(rawInput);

        if (!toolInput) {
          return { error: "Invalid booking confirmation request" };
        }

        return {
          ready_for_confirmation: true,
          ...(toolInput satisfies PrepareBookingToolInput),
        };
      },
    },
  ];

  if (input.knowledgeTool) {
    tools.push(createKnowledgeTool(input.knowledgeTool));
  }

  const allTools = [...tools, ...(input.customTools ?? [])];
  assertUniqueToolNames(allTools);

  return allTools;
}
