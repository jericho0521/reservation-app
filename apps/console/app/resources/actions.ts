"use server";

import { createIdempotencyKey } from "@reservation-platform/sdk";
import { revalidatePath } from "next/cache";
import { createConsolePlatformClient } from "../../lib/platform-client";

export async function createMaintenanceAction(formData: FormData) {
  if (formData.get("confirm_maintenance") !== "on") throw new Error("Maintenance confirmation is required.");
  await createConsolePlatformClient().createResourceMaintenance({
    resource_id: required(formData, "resource_id"), service_id: required(formData, "service_id"), reason: required(formData, "reason"), metadata: { changed_by: "owner_console" },
  }, { idempotencyKey: createIdempotencyKey("console-maintenance") });
  revalidateOperations();
}

export async function endMaintenanceAction(formData: FormData) {
  if (formData.get("confirm_end") !== "on") throw new Error("End-maintenance confirmation is required.");
  await createConsolePlatformClient().endResourceMaintenance(required(formData, "maintenance_id"), { reason: required(formData, "reason"), metadata: { changed_by: "owner_console" } }, { idempotencyKey: createIdempotencyKey("console-maintenance-end") });
  revalidateOperations();
}

function revalidateOperations() { revalidatePath("/resources"); revalidatePath("/"); }
function required(formData: FormData, name: string) { const value = String(formData.get(name) ?? "").trim(); if (!value) throw new Error(`${name.replaceAll("_", " ")} is required.`); return value; }
