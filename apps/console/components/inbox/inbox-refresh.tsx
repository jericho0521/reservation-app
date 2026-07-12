import { LiveStatus } from "../live-status";

export function InboxRefresh({ intervalMs = 10_000, lastUpdated }: { intervalMs?: number; lastUpdated?: string }) { return <LiveStatus baseIntervalMs={intervalMs} lastUpdated={lastUpdated} />; }
