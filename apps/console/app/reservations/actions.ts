"use server";

import { createIdempotencyKey } from "@reservation-platform/sdk";
import { revalidatePath } from "next/cache";
import { createConsolePlatformClient } from "../../lib/platform-client";

export async function cancelReservationAction(formData: FormData) {
  const reservationId = required(formData, "reservation_id");
  if (formData.get("confirm_cancel") !== "on") throw new Error("Cancellation confirmation is required.");
  const reason = required(formData, "reason");
  await createConsolePlatformClient().cancelReservation(reservationId, { reason, metadata: { changed_by: "owner_console" } }, { idempotencyKey: createIdempotencyKey("console-cancel") });
  revalidatePath("/reservations");
  revalidatePath(`/reservations/${encodeURIComponent(reservationId)}`);
  revalidatePath("/");
}

function required(formData: FormData, name: string) { const value = String(formData.get(name) ?? "").trim(); if (!value) throw new Error(`${name.replaceAll("_", " ")} is required.`); return value; }
