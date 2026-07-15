"use server";

import { revalidatePath } from "next/cache";
import { createConsolePlatformClient } from "../../lib/platform-client";

export interface SimulationActionState {
  status: "idle" | "success" | "error";
  sequence: number;
  reply?: string;
  conversationId?: string;
  message?: string;
}

export async function startWhatsAppSessionAction() {
  await createConsolePlatformClient().startWhatsAppSession();
  revalidatePath("/channels");
}

export async function reconnectWhatsAppSessionAction() {
  await createConsolePlatformClient().reconnectWhatsAppSession();
  revalidatePath("/channels");
}

export async function logoutWhatsAppSessionAction() {
  await createConsolePlatformClient().logoutWhatsAppSession();
  revalidatePath("/channels");
}

export async function simulateWhatsAppMessageAction(
  previous: SimulationActionState,
  formData: FormData,
): Promise<SimulationActionState> {
  try {
    const phone = String(formData.get("phone") ?? "").trim();
    const displayName = String(formData.get("display_name") ?? "").trim();
    const result = await createConsolePlatformClient().simulateWhatsAppMessage({
      text: required(formData, "text"),
      ...(phone ? { phone } : {}),
      ...(displayName ? { display_name: displayName } : {}),
      message_id: required(formData, "message_id"),
    });
    revalidatePath("/conversations");
    return {
      status: "success",
      sequence: previous.sequence + 1,
      reply: result.content || (result.automation_suppressed ? "Automation is paused for staff takeover." : "No automated reply."),
      ...(result.conversation_id ? { conversationId: result.conversation_id } : {}),
    };
  } catch (error) {
    return { status: "error", sequence: previous.sequence, message: error instanceof Error ? error.message : "Simulation failed." };
  }
}

function required(formData: FormData, name: string) {
  const value = String(formData.get(name) ?? "").trim();
  if (!value) throw new Error(`${name.replaceAll("_", " ")} is required.`);
  return value;
}
