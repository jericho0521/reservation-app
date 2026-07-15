"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { isPlatformError } from "@reservation-platform/sdk";
import { createConsolePlatformClient } from "../../../lib/platform-client";

export interface StaffInvitationActionState {
  status: "idle" | "success" | "error";
  message?: string;
  invitationUrl?: string;
  expiresAt?: string;
}

export async function inviteStaffAction(
  _previous: StaffInvitationActionState,
  formData: FormData,
): Promise<StaffInvitationActionState> {
  try {
    const result = await createConsolePlatformClient(process.env, fetch, {
      includeActiveVenue: false,
    }).inviteStaff({
      email: requiredField(formData, "email"),
      display_name: requiredField(formData, "display_name"),
      venue_ids: formData.getAll("venue_ids").map(String),
    });
    revalidatePath("/settings/staff");
    return {
      status: "success",
      message: result.delivery === "email"
        ? "Invitation created and queued for email delivery."
        : "Invitation created. Copy this link now; it cannot be shown again.",
      ...(result.invitation_token ? { invitationUrl: await invitationUrl(result.invitation_token) } : {}),
      expiresAt: result.expires_at,
    };
  } catch (error) {
    return {
      status: "error",
      message: isPlatformError(error) ? error.body.message : "The staff invitation could not be created.",
    };
  }
}

export async function updateStaffAccessAction(formData: FormData) {
  const userId = requiredField(formData, "user_id");
  const status = String(formData.get("status") ?? "").trim() as "active" | "disabled" | "";
  await createConsolePlatformClient(process.env, fetch, {
    includeActiveVenue: false,
  }).updateStaffAccess(userId, {
    ...(status ? { status } : {}),
    venue_ids: formData.getAll("venue_ids").map(String),
  });
  revalidatePath("/settings/staff");
}

function requiredField(formData: FormData, name: string) {
  const value = String(formData.get(name) ?? "").trim();
  if (!value) throw new Error(`${name.replaceAll("_", " ")} is required.`);
  return value;
}

async function invitationUrl(token: string) {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host")?.split(",", 1)[0]?.trim()
    ?? requestHeaders.get("host")?.trim();
  const protocol = requestHeaders.get("x-forwarded-proto")?.split(",", 1)[0]?.trim()
    ?? (process.env.NODE_ENV === "production" ? "https" : "http");
  if (!host || !/^[a-z0-9.-]+(?::\d+)?$/iu.test(host) || (protocol !== "https" && protocol !== "http")) {
    throw new Error("The invitation origin is unavailable.");
  }
  if (process.env.NODE_ENV === "production" && protocol !== "https") {
    throw new Error("Production invitation links require HTTPS.");
  }
  return `${protocol}://${host}/admin/invite/${encodeURIComponent(token)}`;
}
