import type { SystemStatusResponse } from "@reservation-platform/sdk";

export interface SystemAttentionItem {
  label: string;
  action: string;
  severity: "warning" | "critical";
}

export function buildSystemAttentionItems(status: SystemStatusResponse): SystemAttentionItem[] {
  const labels: Record<keyof SystemStatusResponse["components"], string> = {
    database: "Database", migrations: "Database migrations", worker: "Background worker", email: "Email delivery",
    ai: "AI provider", whatsapp: "WhatsApp", disk: "Disk capacity", backup: "Verified backup",
  };
  const items = Object.entries(status.components).flatMap(([key, value]) => value.status === "healthy" ? [] : [{ label: labels[key as keyof typeof labels], action: value.action, severity: value.status === "offline" ? "critical" as const : "warning" as const }]);
  if (status.jobs.failed > 0) items.unshift({ label: `${status.jobs.failed} failed job${status.jobs.failed === 1 ? "" : "s"}`, action: "Review safe job error codes and retry after resolving the dependency.", severity: "critical" });
  return items;
}
