import { fileURLToPath } from "node:url";
import { hostname } from "node:os";
import { createClient } from "@supabase/supabase-js";
import { createAiSdkAgentRuntime } from "@reservation-platform/ai-sdk-adapter";
import {
  createSupabaseAvailabilityRepository,
  createSupabaseConversationBookingStateStore,
  createSupabaseConversationRepository,
  createSupabaseExperienceKnowledgeRepository,
  createSupabaseExperienceStudioRepository,
  createSupabaseIntegrationSettingsRepository,
  createSupabasePlatformCatalogRepository,
  createSupabasePlatformJobRepository,
  createSupabaseReservationRepository,
  createSupabaseReservationReadRepository,
  createSupabaseSystemOperationsRepository,
  type ConversationStateSupabaseClient,
  type ConversationSupabaseClient,
  type ExperienceKnowledgeSupabaseClient,
  type ExperienceSupabaseLikeClient,
  type IntegrationSupabaseClient,
  type PlatformJobsSupabaseClient,
  type SystemOperationsRepository,
  type SystemOperationsSupabaseClient,
} from "@project-play/reservations-supabase";
import {
  createConversationProcessingDependencies,
  createIntegrationAgentRuntimeLoader,
  toPlatformReservation,
} from "@reservation-platform/api";
import { decryptSecretEnvelope, safeStructuredLogEntry } from "@reservation-platform/platform-config";

import { createWorkerRuntime, type PlatformJobHandler, type WorkerPlatformJob } from "./runtime.js";
import {
  createEmailJobHandler,
  type EmailJob,
  type LoadedEmailDelivery,
  type SmtpPublicConfig,
} from "./email.js";
import { createAiConversationJobHandler } from "./ai-conversation.js";
import { createProductionWhatsAppRuntime } from "./whatsapp.js";
import {
  createKnowledgeIndexJobHandler,
  createKnowledgeSearchTestJobHandler,
  createLocalKnowledgeEmbedder,
  createSupabaseConversationKnowledgeRetriever,
} from "./knowledge.js";

const pollIntervalMs = 1_000;
const heartbeatIntervalMs = 15_000;

if (isDirectRun()) {
  void runDirectWorker();
}

async function runDirectWorker(): Promise<void> {
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);

  logLifecycleEvent("worker_started");
  let stopHeartbeat: (() => void) | undefined;

  try {
    const client = createClient(
      requiredEnvironment("RESERVATION_SUPABASE_URL"),
      requiredEnvironment("RESERVATION_SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const repository = createSupabasePlatformJobRepository(client as unknown as PlatformJobsSupabaseClient);
    const workerId = process.env.RESERVATION_WORKER_ID?.trim() || `${hostname()}:${process.pid}`;
    stopHeartbeat = startWorkerHeartbeat(
      createSupabaseSystemOperationsRepository(client as unknown as SystemOperationsSupabaseClient),
      { workerId, releaseVersion: process.env.RESERVATION_RELEASE_VERSION?.trim() || "development" },
    );
    const whatsapp = isEnabledEnvironment("RESERVATION_WHATSAPP_ENABLED")
      ? createProductionWhatsAppRuntime({
          client,
          jobs: repository,
          sessionEncryptionKey: requiredEnvironment("RESERVATION_WHATSAPP_SESSION_ENCRYPTION_KEY"),
          authDirectory: requiredEnvironment("RESERVATION_WHATSAPP_SESSION_AUTH_DIR"),
        })
      : undefined;
    const runtime = createWorkerRuntime({
      signal: controller.signal,
      pollIntervalMs,
      workerId,
      repository,
      handlers: {
        ...productionJobHandlers(client, requiredEnvironment("RESERVATION_INSTALLATION_MASTER_KEY"), { preloadKnowledge: true }),
        ...(whatsapp?.handlers ?? {}),
      },
      outcomeReporter: createNotificationOutcomeReporter(client),
    });
    await whatsapp?.enqueueRestore();
    await runtime.start();
    logLifecycleEvent("worker_stopped");
  } catch {
    process.exitCode = 1;
    logLifecycleEvent("worker_failed");
  } finally {
    stopHeartbeat?.();
    process.removeListener("SIGTERM", stop);
    process.removeListener("SIGINT", stop);
  }
}

export function startWorkerHeartbeat(
  repository: Pick<SystemOperationsRepository, "heartbeat">,
  options: { workerId: string; releaseVersion: string; intervalMs?: number; now?: () => Date; logger?: (event: string) => void },
) {
  const write = async () => {
    try {
      await repository.heartbeat({
        component: "worker",
        instanceId: options.workerId,
        releaseVersion: options.releaseVersion,
        status: "healthy",
        metadata: {},
        heartbeatAt: (options.now?.() ?? new Date()).toISOString(),
      });
    } catch {
      (options.logger ?? logLifecycleEvent)("worker_heartbeat_failed");
    }
  };
  void write();
  const interval = setInterval(() => void write(), options.intervalMs ?? heartbeatIntervalMs);
  interval.unref();
  return () => clearInterval(interval);
}

export function productionJobHandlers(
  client: unknown,
  installationKey: string,
  options: { preloadKnowledge?: boolean } = {},
): Readonly<Record<string, PlatformJobHandler | undefined>> {
  const knowledgeEmbedder = createLocalKnowledgeEmbedder({
    modelPath: process.env.RESERVATION_EMBEDDING_MODEL_PATH?.trim() || "/app/models",
    modelId: process.env.RESERVATION_EMBEDDING_MODEL_ID?.trim() || "reservation-multilingual-minilm",
  });
  const knowledgeClient = client as unknown as Parameters<typeof createKnowledgeIndexJobHandler>[0]["client"];
  if (options.preloadKnowledge) {
    void knowledgeEmbedder.embed(["reservation knowledge warmup"]).catch(() => {
      // Retrieval health is reported by failed knowledge jobs; other job kinds
      // must continue even when the local model cannot be preloaded.
    });
  }
  const integrations = createSupabaseIntegrationSettingsRepository(client as unknown as IntegrationSupabaseClient);
  const reservations = createSupabaseReservationReadRepository(
    client as unknown as Parameters<typeof createSupabaseReservationReadRepository>[0],
  );
  const handler = createEmailJobHandler({
    async load(job) {
      const settings = await integrations.read(job.tenantId, "email");
      if (!settings?.enabled) return undefined;
      const config = parseSmtpSettings(settings.publicConfig);
      if (!config) return undefined;
      const encryptedCredential = await integrations.readCredential(job.tenantId, "email");
      if (job.payload.kind.startsWith("appointment_")) {
        const result = await reservations.readReservationById(job.payload.reservationId);
        if (result.error || !result.data) return undefined;
        const appointment = toPlatformReservation(result.data);
        if (job.payload.kind === "appointment_reminder" && !isCurrentReminder(job, appointment)) return undefined;
        return {
          ...appointmentMessage(job, appointment.start_at),
          settings: config,
          ...(encryptedCredential ? { encryptedCredential } : {}),
        };
      }
      return accountMessage(job, config, encryptedCredential, installationKey);
    },
    decrypt: (envelope) => decryptSecretEnvelope(envelope, installationKey),
  });
  const conversations = createSupabaseConversationRepository(client as ConversationSupabaseClient);
  const catalogRepository = createSupabasePlatformCatalogRepository(client as Parameters<typeof createSupabasePlatformCatalogRepository>[0]);
  const availabilityRepository = createSupabaseAvailabilityRepository(client as Parameters<typeof createSupabaseAvailabilityRepository>[0]);
  const reservationCreateRepository = createSupabaseReservationRepository(client as Parameters<typeof createSupabaseReservationRepository>[0]);
  const experienceStudioRepository = createSupabaseExperienceStudioRepository(client as ExperienceSupabaseLikeClient);
  const experienceKnowledgeRepository = createSupabaseExperienceKnowledgeRepository(client as ExperienceKnowledgeSupabaseClient);
  const conversationDependencies = createConversationProcessingDependencies({
    conversations,
    state: createSupabaseConversationBookingStateStore(client as ConversationStateSupabaseClient),
    catalogRepository,
    availabilityRepository,
    reservationCreateRepository,
    experienceStudioRepository,
    experienceKnowledgeRepository,
  });
  const aiRuntimeLoader = createIntegrationAgentRuntimeLoader({
    repository: integrations,
    decryptCredential: (envelope) => decryptSecretEnvelope<Record<string, unknown>>(envelope, installationKey),
    createRuntime: createAiSdkAgentRuntime,
  });
  const aiHandler = createAiConversationJobHandler({
    runtimeLoader: aiRuntimeLoader,
    loadDependencies: () => conversationDependencies,
    retriever: createSupabaseConversationKnowledgeRetriever({
      client: knowledgeClient,
      embedder: knowledgeEmbedder,
    }),
  });
  return {
    "notification.email": (job) => handler(job as unknown as EmailJob),
    "conversation.process_ai": aiHandler,
    "knowledge.index_source": createKnowledgeIndexJobHandler({
      client: knowledgeClient,
      embedder: knowledgeEmbedder,
    }),
    "knowledge.test_search": createKnowledgeSearchTestJobHandler({
      client: knowledgeClient,
      embedder: knowledgeEmbedder,
    }),
  };
}

export function createNotificationOutcomeReporter(client: unknown) {
  const rpcClient = client as { rpc(name: string, params: Record<string, unknown>): PromiseLike<unknown> };
  const rpc = rpcClient.rpc.bind(rpcClient) as (
    name: string,
    params: Record<string, unknown>,
  ) => PromiseLike<unknown>;
  const details = (job: WorkerPlatformJob) => {
    const kind = job.payload.kind;
    const bookingId = job.payload.reservationId;
    return job.kind === "notification.email"
      && typeof kind === "string" && kind.startsWith("appointment_")
      && typeof bookingId === "string"
      ? { p_tenant_id: job.tenantId, p_booking_id: bookingId, p_notification_kind: kind }
      : undefined;
  };
  return {
    async attempt(job: WorkerPlatformJob) {
      const input = details(job);
      if (input) await rpc("platform_record_notification_attempt", input);
    },
    async delivered(job: WorkerPlatformJob, providerMessageId?: string) {
      const input = details(job);
      if (input) await rpc("platform_record_notification_delivered", { ...input, p_provider_message_id: providerMessageId ?? null });
    },
    async retrying(job: WorkerPlatformJob, availableAt: string, errorCode: string) {
      const input = details(job);
      if (input) await rpc("platform_record_notification_retry", { ...input, p_next_attempt_at: availableAt, p_error_code: errorCode, p_final: false });
    },
    async failed(job: WorkerPlatformJob, errorCode: string) {
      const input = details(job);
      if (input) await rpc("platform_record_notification_retry", { ...input, p_next_attempt_at: null, p_error_code: errorCode, p_final: true });
    },
  };
}

export function isCurrentReminder(
  job: EmailJob,
  appointment: { status?: string; date?: string; start_time?: string; start_at?: string },
) {
  if (appointment.status === "cancelled") return false;
  if (job.payload.expectedAppointmentDate || job.payload.expectedAppointmentTime) {
    return appointment.date === job.payload.expectedAppointmentDate
      && appointment.start_time === job.payload.expectedAppointmentTime;
  }
  return Boolean(appointment.start_at && appointment.start_at === job.payload.expectedAppointmentStart);
}

function parseSmtpSettings(value: Record<string, unknown>): SmtpPublicConfig | undefined {
  if (typeof value.host !== "string" || typeof value.port !== "number"
    || (value.tls_mode !== "required" && value.tls_mode !== "starttls" && value.tls_mode !== "plain")
    || typeof value.from_address !== "string") return undefined;
  return {
    host: value.host,
    port: value.port,
    tlsMode: value.tls_mode,
    from: value.from_address,
    ...(typeof value.from_name === "string" ? { fromName: value.from_name } : {}),
  };
}

function appointmentMessage(job: EmailJob, startAt?: string): Omit<LoadedEmailDelivery, "settings" | "encryptedCredential"> {
  const when = startAt ? new Date(startAt).toLocaleString(job.payload.locale) : "the scheduled time";
  const copy = {
    appointment_confirmed: ["Appointment confirmed", "Your appointment is confirmed."],
    appointment_rescheduled: ["Appointment rescheduled", "Your appointment has been rescheduled."],
    appointment_cancelled: ["Appointment cancelled", "Your appointment has been cancelled."],
    appointment_reminder: ["Appointment reminder", "Your appointment is coming up."],
  } as const;
  const selected = copy[job.payload.kind as keyof typeof copy] ?? ["Appointment update", "Your appointment was updated."];
  return { subject: selected[0], heading: selected[1], lines: [`Appointment reference: ${job.payload.reservationId}`, `Scheduled time: ${when}`] };
}

function accountMessage(
  job: EmailJob,
  settings: NonNullable<ReturnType<typeof parseSmtpSettings>>,
  encryptedCredential: unknown,
  installationKey: string,
): LoadedEmailDelivery {
  const action = job.payload.encryptedAction
    ? decryptSecretEnvelope<{ token: string }>(job.payload.encryptedAction, installationKey)
    : undefined;
  const baseUrl = process.env.RESERVATION_CONSOLE_PUBLIC_URL ?? "";
  const invitation = job.payload.kind === "staff_invitation";
  const link = action ? buildAccountActionLink(job.payload.kind, action.token, baseUrl) : undefined;
  return {
    subject: invitation ? "Your staff invitation" : "Reset your password",
    heading: invitation ? "You have been invited" : "Password reset requested",
    lines: link ? [`Open this secure link: ${link}`] : ["Contact the business owner for a new secure link."],
    settings,
    ...(encryptedCredential ? { encryptedCredential } : {}),
  };
}

export function buildAccountActionLink(kind: string, token: string, baseUrl: string) {
  const normalizedBase = baseUrl.replace(/\/$/u, "");
  if (!normalizedBase) return undefined;
  const path = kind === "staff_invitation" ? "/invite/" : "/reset-password/";
  return `${normalizedBase}${path}${encodeURIComponent(token)}`;
}

function requiredEnvironment(name: "RESERVATION_SUPABASE_URL" | "RESERVATION_SUPABASE_SERVICE_ROLE_KEY" | "RESERVATION_INSTALLATION_MASTER_KEY" | "RESERVATION_WHATSAPP_SESSION_ENCRYPTION_KEY" | "RESERVATION_WHATSAPP_SESSION_AUTH_DIR") {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function isEnabledEnvironment(name: string) {
  return process.env[name]?.trim().toLowerCase() === "true";
}

function logLifecycleEvent(event: "worker_started" | "worker_stopped" | "worker_failed" | "worker_heartbeat_failed"): void {
  console.log(JSON.stringify(safeStructuredLogEntry({
    level: event === "worker_failed" ? "error" : "info",
    event,
    component: "worker",
    ...(process.env.RESERVATION_RELEASE_VERSION?.trim() ? { release: process.env.RESERVATION_RELEASE_VERSION.trim() } : {}),
  })));
}

function isDirectRun(): boolean {
  return process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
}
