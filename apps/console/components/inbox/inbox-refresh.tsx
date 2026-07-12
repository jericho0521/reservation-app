"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function InboxRefresh({ intervalMs = 10_000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = window.setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs, router]);
  return <span className="live-refresh" aria-label="Conversation list refreshes automatically">Live · refreshes every {Math.round(intervalMs / 1000)}s</span>;
}
