import { ConversationSimulator } from "../../components/channels/conversation-simulator";
import { ReadinessCard } from "../../components/channels/readiness-card";
import { SetupError, safeSetupErrorMessage } from "../../components/setup-error";
import { createConsolePlatformClient } from "../../lib/platform-client";
import { logoutWhatsAppSessionAction, startWhatsAppSessionAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function ChannelsPage() {
  try {
    const client = createConsolePlatformClient();
    const [readiness, session] = await Promise.all([client.getWhatsAppReadiness(), client.getWhatsAppSessionStatus()]);
    const qrSession = session.status === "pending_qr" ? await client.getWhatsAppSessionQr() : undefined;
    return <div className="page-stack">
      <header className="page-header split-header"><div><span className="eyebrow">Channels & AI</span><h1>Know what is demo-ready</h1><p>Configuration, connectivity, and runtime health are reported separately so setup gaps are visible.</p></div><span className={`status-pill ${readiness.production_ready ? "ready" : "degraded"}`}>{readiness.production_ready ? "Production ready" : "Setup required"}</span></header>
      <section className="readiness-grid" aria-label="Channel readiness"><ReadinessCard title="AI booking agent" status={readiness.ai} /><ReadinessCard title="WhatsApp" status={readiness.whatsapp} detail={`Session: ${session.status.replaceAll("_", " ")}`} /></section>
      <section className="session-controls"><div><strong>WhatsApp session</strong><span>{session.status.replaceAll("_", " ")}</span></div>{session.status === "connected" || session.status === "pending_qr" ? <form action={logoutWhatsAppSessionAction}><button className="secondary-action" type="submit">Disconnect session</button></form> : <form action={startWhatsAppSessionAction}><button className="primary-action" type="submit">Start QR pairing</button></form>}</section>
      {qrSession?.qr_code ? <section className="qr-owner-panel"><span className="eyebrow">Authenticated owner pairing</span><h2>WhatsApp QR payload</h2><p>Use this only in the WhatsApp pairing screen. It is never written to application logs.</p><details><summary>Reveal pairing payload</summary><code>{qrSession.qr_code}</code></details></section> : null}
      <ConversationSimulator enabled={readiness.simulation_enabled} />
    </div>;
  } catch (error) { return <SetupError message={safeSetupErrorMessage(error)} />; }
}
