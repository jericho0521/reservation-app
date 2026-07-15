"use server";

import { createIdempotencyKey } from "@reservation-platform/sdk";
import { revalidatePath } from "next/cache";
import { isAppointmentStatus, validateAppointmentTransition } from "../../lib/appointment-view";
import { createConsolePlatformClient } from "../../lib/platform-client";

export type AppointmentActionState = { status: "idle" | "success" | "error"; message: string };

export async function transitionAppointmentStatusAction(
  _previousState: AppointmentActionState,
  formData: FormData,
): Promise<AppointmentActionState> {
  try {
    const reservationId = required(formData, "reservation_id");
    const expectedStatus = required(formData, "expected_status");
    const targetStatus = required(formData, "target_status");
    const reason = String(formData.get("reason") ?? "").trim();
    if (!isAppointmentStatus(targetStatus)) throw new Error("Choose a supported appointment status.");
    const client = createConsolePlatformClient();
    const current = await client.getReservation(reservationId);
    if (current.status !== expectedStatus) throw new Error("This appointment changed since the page loaded. Refresh and try again.");
    const invalid = validateAppointmentTransition(current.status, targetStatus, reason);
    if (invalid) throw new Error(invalid);
    await client.updateReservation(reservationId, {
      status: targetStatus,
      source: "owner_console",
      metadata: {
        ...(current.metadata ?? {}),
        transition_source: "owner_console",
        transition_from: current.status,
        transition_to: targetStatus,
        ...(reason ? { transition_reason: reason } : {}),
      },
    }, { idempotencyKey: createIdempotencyKey("console-status") });
    revalidateAppointmentPaths(reservationId);
    return { status: "success", message: `Appointment marked ${targetStatus === "no_show" ? "no-show" : targetStatus}.` };
  } catch (error) {
    return { status: "error", message: appointmentMutationError(error) };
  }
}

export async function rescheduleAppointmentAction(
  _previousState: AppointmentActionState,
  formData: FormData,
): Promise<AppointmentActionState> {
  try {
    const reservationId = required(formData, "reservation_id");
    const expectedStatus = required(formData, "expected_status");
    const date = required(formData, "date");
    const startTime = required(formData, "start_time");
    const endTime = required(formData, "end_time");
    const reason = required(formData, "reason");
    const client = createConsolePlatformClient();
    const current = await client.getReservation(reservationId);
    if (current.status !== expectedStatus) throw new Error("This appointment changed since the page loaded. Refresh and try again.");
    if (["cancelled", "completed", "no_show"].includes(current.status)) throw new Error("A terminal appointment cannot be rescheduled.");
    await client.rescheduleReservation(reservationId, {
      date,
      start_time: startTime,
      end_time: endTime,
      metadata: {
        ...(current.metadata ?? {}),
        reschedule_source: "owner_console",
        reschedule_reason: reason,
      },
    }, { idempotencyKey: createIdempotencyKey("console-reschedule") });
    revalidateAppointmentPaths(reservationId);
    return { status: "success", message: "Appointment rescheduled." };
  } catch (error) {
    return { status: "error", message: appointmentMutationError(error) };
  }
}

export async function cancelReservationAction(formData: FormData) {
  const reservationId = required(formData, "reservation_id");
  if (formData.get("confirm_cancel") !== "on") throw new Error("Cancellation confirmation is required.");
  const reason = required(formData, "reason");
  await createConsolePlatformClient().cancelReservation(reservationId, { reason, metadata: { changed_by: "owner_console" } }, { idempotencyKey: createIdempotencyKey("console-cancel") });
  revalidateAppointmentPaths(reservationId);
}

function required(formData: FormData, name: string) { const value = String(formData.get(name) ?? "").trim(); if (!value) throw new Error(`${name.replaceAll("_", " ")} is required.`); return value; }

function revalidateAppointmentPaths(reservationId: string) {
  revalidatePath("/");
  revalidatePath("/reservations");
  revalidatePath(`/reservations/${encodeURIComponent(reservationId)}`);
  revalidatePath("/analytics");
}

function appointmentMutationError(error: unknown) {
  if (error && typeof error === "object" && "body" in error) {
    const body = (error as { body?: { error?: { message?: unknown } } }).body;
    const message = body?.error?.message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return error instanceof Error && error.message ? error.message : "The appointment could not be changed. Refresh and try again.";
}
