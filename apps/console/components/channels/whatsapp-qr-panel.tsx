"use client";

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";

type QrState = { status: "loading" } | { status: "ready"; imageUrl: string } | { status: "error"; message: string };

export function WhatsAppQrPanel({ active }: { active: boolean }) {
  const [state, setState] = useState<QrState>({ status: "loading" });
  const refresh = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const response = await fetch("/admin/api/whatsapp/qr", { cache: "no-store", credentials: "same-origin", headers: { Accept: "application/json" } });
      const result = await response.json() as { qr_code?: unknown; error?: unknown };
      if (!response.ok || typeof result.qr_code !== "string" || !result.qr_code) throw new Error("A pairing code is not available yet.");
      const imageUrl = await QRCode.toDataURL(result.qr_code, { width: 288, margin: 2, errorCorrectionLevel: "M" });
      setState({ status: "ready", imageUrl });
    } catch (error) {
      setState({ status: "error", message: error instanceof Error ? error.message : "A pairing code is not available yet." });
    }
  }, []);

  useEffect(() => { if (active) void refresh(); }, [active, refresh]);
  if (!active) return null;
  return <section className="qr-owner-panel" data-session-state={state.status === "ready" ? "qr" : "pairing"}>
    <span className="eyebrow">Private owner pairing</span><h2>{state.status === "ready" ? "QR payload ready" : "Preparing QR pairing"}</h2>
    <p>This payload is fetched from a private no-store endpoint and is never written to the console or application logs.</p>
    {state.status === "loading" ? <p className="form-message">Requesting a fresh pairing payload…</p> : null}
    {state.status === "error" ? <div><p className="form-message error">{state.message}</p><button className="secondary-action" type="button" onClick={() => void refresh()}>Try again</button></div> : null}
    {state.status === "ready" ? <div className="pairing-qr"><img src={state.imageUrl} alt="WhatsApp device pairing QR code" width="288" height="288" /><p>In WhatsApp, open <strong>Linked devices</strong>, choose <strong>Link a device</strong>, then scan this code.</p></div> : null}
  </section>;
}
