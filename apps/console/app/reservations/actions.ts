"use server";

import { createIdempotencyKey } from "@reservation-platform/sdk";
import { revalidatePath } from "next/cache";
import { isAppointmentStatus, validateAppointmentTransition } from "../../lib/appointment-view";
import { createConsolePlatformClient } from "../../lib/platform-client";

export type AppointmentActionState = { status: "idle" | "success" | "error"; message: string };

export async function createStaffAppointmentAction(
  _previousState: AppointmentActionState,
  formData: FormData,
): Promise<AppointmentActionState> {
  try {
    const serviceId = required(formData, "service_id");
    const staffId = required(formData, "staff_id");
    const date = required(formData, "date");
    const startTime = required(formData, "start_time");
    const client = createConsolePlatformClient();
    const services = await client.listServices();
    const service = services.services.find((entry) => entry.service_id === serviceId);
    if (!service?.duration_minutes) throw new Error("The selected service does not have a valid duration.");
    const endTime = addMinutes(startTime, service.duration_minutes);
    await client.createStaffAppointment({
      service_id: serviceId,
      staff_id: staffId,
      date,
      start_time: startTime,
      end_time: endTime,
      quantity: 1,
      customer: {
        name: required(formData, "customer_name"),
        email: required(formData, "customer_email"),
        ...(String(formData.get("customer_phone") ?? "").trim() ? { phone: String(formData.get("customer_phone")).trim() } : {}),
      },
      source: "staff",
    }, { idempotencyKey: createIdempotencyKey("console-staff-create") });
    revalidateAppointmentPaths("");
    return { status: "success", message: "Appointment created through the availability engine." };
  } catch (error) {
    return { status: "error", message: appointmentMutationError(error) };
  }
}

export async function transitionAppointmentStatusAction(
  _previousState: AppointmentActionState,
  formData: FormData,
): Promise<AppointmentActionState> {
  try {
    const reservationId = required(formData, "reservation_id");
    const expectedStatus = required(formData, "expected_status");
    const targetStatus = required(formData, "target_status");
    const transition_reason = String(formData.get("transition_reason") ?? "").trim();
    if (!isAppointmentStatus(targetStatus)) throw new Error("Choose a supported appointment status.");
    const client = createConsolePlatformClient();
    const current = await client.getReservation(reservationId);
    if (current.status !== expectedStatus) throw new Error("This appointment changed since the page loaded. Refresh and try again.");
    const invalid = validateAppointmentTransition(current.status, targetStatus, transition_reason);
    if (invalid) throw new Error(invalid);
    await client.transitionAppointment(reservationId, {
      expected_status: current.status as "pending" | "confirmed" | "completed" | "cancelled" | "no_show",
      target_status: targetStatus,
      ...(transition_reason ? { reason: transition_reason } : {}),
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
    const reason = required(formData, "reason");
    const client = createConsolePlatformClient();
    const current = await client.getReservation(reservationId);
    if (current.status !== expectedStatus) throw new Error("This appointment changed since the page loaded. Refresh and try again.");
    if (["cancelled", "completed", "no_show"].includes(current.status)) throw new Error("A terminal appointment cannot be rescheduled.");
    if (!current.staff_id) throw new Error("This appointment has no assigned practitioner.");
    await client.staffRescheduleAppointment(reservationId, {
      expected_status: current.status as "pending" | "confirmed",
      date,
      start_time: startTime,
      staff_id: current.staff_id,
      reason,
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

function addMinutes(startTime: string, durationMinutes: number) {
  const match = /^(\d{2}):(\d{2})$/u.exec(startTime);
  if (!match) throw new Error("Choose a valid appointment start time.");
  const minutes = Number(match[1]) * 60 + Number(match[2]) + durationMinutes;
  if (minutes >= 24 * 60) throw new Error("The appointment must end on the same day.");
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function revalidateAppointmentPaths(reservationId: string) {
  revalidatePath("/");
  revalidatePath("/reservations");
  if (reservationId) revalidatePath(`/reservations/${encodeURIComponent(reservationId)}`);
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
