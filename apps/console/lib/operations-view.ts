import type { OperationsOverviewResponse } from "@reservation-platform/sdk";

export interface OperationsAttentionItem {
  label: string;
  detail: string;
  href: string;
  severity: "urgent" | "warning" | "info";
}

export function buildOperationsAttentionItems(overview: OperationsOverviewResponse): OperationsAttentionItem[] {
  const items: OperationsAttentionItem[] = [];
  if (overview.conversations.staff_takeover > 0) items.push({ label: "Staff replies needed", detail: `${overview.conversations.staff_takeover} conversation${overview.conversations.staff_takeover === 1 ? " is" : "s are"} under manual control.`, href: "/admin/conversations", severity: "urgent" });
  if (overview.reservations.pending > 0) items.push({ label: "Appointments awaiting confirmation", detail: `${overview.reservations.pending} appointment${overview.reservations.pending === 1 ? " is" : "s are"} still pending today.`, href: "/admin/reservations?status=pending", severity: "urgent" });
  if (overview.resources.maintenance > 0) items.push({ label: "Resources under maintenance", detail: `${overview.resources.maintenance} resource${overview.resources.maintenance === 1 ? " is" : "s are"} unavailable.`, href: "/admin/resources", severity: "warning" });
  for (const [channel, status] of Object.entries(overview.channel_readiness)) {
    if (!status.ready && status.desired_enabled) items.push({ label: `${channelLabel(channel)} needs setup`, detail: status.message ?? "Complete channel setup.", href: "/admin/channels", severity: "warning" });
  }
  if (items.length === 0) items.push({ label: "No urgent issues", detail: "Bookings, resources, conversations, and enabled channels look healthy.", href: "/admin/reservations", severity: "info" });
  return items;
}

export function channelLabel(value: string) { return value === "web_booking" ? "Web booking" : value === "web_chat" ? "Web chat" : value === "whatsapp" ? "WhatsApp" : value === "staff" ? "Staff" : value === "simulation" ? "Simulation" : "Unknown"; }
