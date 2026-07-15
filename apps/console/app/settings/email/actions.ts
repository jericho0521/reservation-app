"use server";

import { revalidatePath } from "next/cache";
import { isPlatformError } from "@reservation-platform/sdk";
import { createConsolePlatformClient } from "../../../lib/platform-client";

export interface EmailSettingsActionState {
  status: "idle" | "success" | "error";
  message?: string;
}

export async function saveEmailSettingsAction(
  _previous: EmailSettingsActionState,
  formData: FormData,
): Promise<EmailSettingsActionState> {
  try {
    const username = optionalField(formData, "username");
    const password = optionalField(formData, "password");
    if (Boolean(username) !== Boolean(password)) {
      return { status: "error", message: "Enter both the SMTP username and password, or leave both blank." };
    }
    await createConsolePlatformClient(process.env, fetch, { includeActiveVenue: false })
      .updateEmailIntegrationSettings({
        enabled: formData.get("enabled") === "on",
        host: requiredField(formData, "host"),
        port: smtpPort(formData),
        tls_mode: requiredField(formData, "tls_mode") as "required" | "starttls" | "plain",
        from_address: requiredField(formData, "from_address"),
        ...(optionalField(formData, "from_name") ? { from_name: optionalField(formData, "from_name") } : {}),
        ...(username && password ? { username, password } : {}),
      });
    revalidatePath("/settings/email");
    revalidatePath("/setup/channels");
    return { status: "success", message: "Email delivery settings saved." };
  } catch (error) {
    return actionError(error, "Email delivery settings could not be saved.");
  }
}

export async function testEmailConnectionAction(
  _previous: EmailSettingsActionState,
): Promise<EmailSettingsActionState> {
  try {
    const result = await createConsolePlatformClient(process.env, fetch, { includeActiveVenue: false })
      .testEmailIntegration({ timeoutMs: 12_000 });
    return { status: result.ok ? "success" : "error", message: result.message };
  } catch (error) {
    return actionError(error, "The SMTP connection could not be tested.");
  }
}

function requiredField(formData: FormData, name: string) {
  const value = optionalField(formData, name);
  if (!value) throw new Error(`${name.replaceAll("_", " ")} is required.`);
  return value;
}

function optionalField(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function smtpPort(formData: FormData) {
  const value = Number(requiredField(formData, "port"));
  if (!Number.isSafeInteger(value) || value < 1 || value > 65_535) {
    throw new Error("port must be between 1 and 65535.");
  }
  return value;
}

function actionError(error: unknown, fallback: string): EmailSettingsActionState {
  return {
    status: "error",
    message: isPlatformError(error)
      ? error.body.message
      : error instanceof Error && /required|between|username|password/iu.test(error.message)
        ? error.message
        : fallback,
  };
}
