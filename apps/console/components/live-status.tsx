"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { nextPollingDelay } from "../lib/polling-policy";

export function LiveStatus({ lastUpdated, baseIntervalMs = 10_000 }: { lastUpdated?: string; baseIntervalMs?: number }) {
  const router = useRouter();
  const [failures, setFailures] = useState(0);
  const [hidden, setHidden] = useState(false);
  const [online, setOnline] = useState(true);

  useEffect(() => { setFailures(0); }, [lastUpdated]);
  useEffect(() => {
    const sync = () => { setHidden(document.visibilityState !== "visible"); setOnline(navigator.onLine); };
    const offline = () => { setOnline(false); setFailures((value) => value + 1); };
    window.addEventListener("online", sync); window.addEventListener("offline", offline); document.addEventListener("visibilitychange", sync); sync();
    return () => { window.removeEventListener("online", sync); window.removeEventListener("offline", offline); document.removeEventListener("visibilitychange", sync); };
  }, []);
  useEffect(() => {
    const delay = nextPollingDelay({ failures, hidden, online, baseIntervalMs });
    if (delay === null) return;
    const id = window.setTimeout(() => { router.refresh(); }, delay);
    return () => window.clearTimeout(id);
  }, [baseIntervalMs, failures, hidden, online, router, lastUpdated]);

  return <div className="live-status"><span className={online ? "is-online" : "is-offline"}>{hidden ? "Paused" : online ? "Live" : "Offline"}</span>{lastUpdated ? <time dateTime={lastUpdated}>Updated {formatTime(lastUpdated)}</time> : <small>Auto refresh</small>}<button type="button" onClick={() => router.refresh()}>Refresh now</button></div>;
}

function formatTime(value: string) { const date = new Date(value); return Number.isNaN(date.valueOf()) ? value : date.toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" }); }
