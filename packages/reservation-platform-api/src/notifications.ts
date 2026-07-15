import type { ReservationResponse } from "@reservation-platform/contract-types";

export type EmailNotificationKind =
  | "appointment_confirmed"
  | "appointment_rescheduled"
  | "appointment_cancelled"
  | "appointment_reminder"
  | "staff_invitation"
  | "password_reset";

export interface EmailNotificationPayload extends Record<string, unknown> {
  kind: EmailNotificationKind;
  reservationId: string;
  recipient: string;
  locale: string;
  expectedAppointmentStart?: string;
  expectedAppointmentDate?: string;
  expectedAppointmentTime?: string;
  encryptedAction?: {
    v: 1;
    alg: "aes-256-gcm";
    iv: string;
    tag: string;
    ciphertext: string;
  };
}

export interface NotificationJobQueue {
  enqueue(input: {
    tenantId: string;
    venueId?: string;
    kind: "notification.email";
    payload: EmailNotificationPayload;
    maxAttempts: number;
    availableAt?: string;
    idempotencyKey: string;
  }): Promise<{ jobId: string }>;
}

export async function enqueueAppointmentNotifications(input: {
  appointment: ReservationResponse;
  tenantId: string;
  venueId?: string;
  jobs: NotificationJobQueue;
  reminderMinutes: number;
  locale?: string;
  event?: "confirmed" | "rescheduled" | "cancelled";
}): Promise<void> {
  const recipient = input.appointment.customer?.email?.trim().toLowerCase();
  if (!recipient) return;
  const event = input.event ?? "confirmed";
  await enqueue(input, `appointment_${event}`, recipient, new Date().toISOString());
  if (event === "cancelled" || input.reminderMinutes <= 0) return;
  const start = appointmentStart(input.appointment);
  if (!start) return;
  const reminderAt = new Date(start.getTime() - input.reminderMinutes * 60_000);
  await enqueue(input, "appointment_reminder", recipient, reminderAt.toISOString());
}

export async function enqueueAccountLinkNotification(input: {
  tenantId: string;
  venueId?: string;
  jobs: NotificationJobQueue;
  kind: "staff_invitation" | "password_reset";
  recipient: string;
  referenceId: string;
  availableAt?: string;
  locale?: string;
  encryptedAction?: EmailNotificationPayload["encryptedAction"];
}): Promise<void> {
  await input.jobs.enqueue({
    tenantId: input.tenantId,
    ...(input.venueId ? { venueId: input.venueId } : {}),
    kind: "notification.email",
    payload: {
      kind: input.kind,
      reservationId: input.referenceId,
      recipient: input.recipient.trim().toLowerCase(),
      locale: input.locale ?? "en",
      ...(input.encryptedAction ? { encryptedAction: input.encryptedAction } : {}),
    },
    maxAttempts: 5,
    ...(input.availableAt ? { availableAt: input.availableAt } : {}),
    idempotencyKey: `${input.kind}:${input.referenceId}`,
  });
}

async function enqueue(
  input: Parameters<typeof enqueueAppointmentNotifications>[0],
  kind: Extract<EmailNotificationKind, `appointment_${string}`>,
  recipient: string,
  availableAt: string,
) {
  const reservationId = input.appointment.reservation_id;
  const expectedAppointmentStart = appointmentStart(input.appointment)?.toISOString();
  const occurrence = kind === "appointment_reminder" || kind === "appointment_rescheduled"
    ? expectedAppointmentStart
    : undefined;
  await input.jobs.enqueue({
    tenantId: input.tenantId,
    ...(input.venueId ? { venueId: input.venueId } : {}),
    kind: "notification.email",
    payload: {
      kind,
      reservationId,
      recipient,
      locale: input.locale ?? "en",
      ...(expectedAppointmentStart ? { expectedAppointmentStart } : {}),
      ...(input.appointment.date ? { expectedAppointmentDate: input.appointment.date } : {}),
      ...(input.appointment.start_time ? { expectedAppointmentTime: input.appointment.start_time } : {}),
    },
    maxAttempts: 5,
    availableAt,
    idempotencyKey: `booking:${reservationId}:${kind.replace("appointment_", "")}${occurrence ? `:${occurrence}` : ""}`,
  });
}

export async function enqueueAppointmentNotificationsSafely(
  input: Parameters<typeof enqueueAppointmentNotifications>[0],
): Promise<void> {
  try {
    await enqueueAppointmentNotifications(input);
  } catch {
    // Notification delivery is durable best-effort work and must never undo a committed appointment.
  }
}

function appointmentStart(appointment: ReservationResponse): Date | undefined {
  const value = appointment.start_at
    ?? (appointment.date && appointment.start_time ? `${appointment.date}T${appointment.start_time}:00Z` : undefined);
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : undefined;
}
