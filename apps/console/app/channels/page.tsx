import { ConversationSimulator } from "../../components/channels/conversation-simulator";
import { ReadinessCard } from "../../components/channels/readiness-card";
import { WhatsAppQrPanel } from "../../components/channels/whatsapp-qr-panel";
import { WhatsAppSessionPanel } from "../../components/channels/whatsapp-session-panel";
import { SetupError, safeSetupErrorMessage } from "../../components/setup-error";
import { resolveChannelPageState } from "../../lib/channel-page-state";
import { createConsolePlatformClient } from "../../lib/platform-client";

export const dynamic = "force-dynamic";

export default async function ChannelsPage() {
  try {
    const client = createConsolePlatformClient();
    const [readinessResult, sessionResult] = await Promise.allSettled([client.getWhatsAppReadiness(), client.getWhatsAppSessionStatus()]);
    const { readiness, session } = resolveChannelPageState(readinessResult, sessionResult);
    return <div className="page-stack">
      <header className="page-header split-header"><div><span className="eyebrow">Channels & AI</span><h1>Know what is demo-ready</h1><p>Configuration, connectivity, and runtime health are reported separately so setup gaps are visible.</p></div><span className={`status-pill ${readiness.production_ready ? "ready" : "degraded"}`}>{readiness.production_ready ? "Production ready" : "Setup required"}</span></header>
      <section className="readiness-grid" aria-label="Channel readiness"><ReadinessCard title="AI booking agent" status={readiness.ai} /><ReadinessCard title="WhatsApp" status={readiness.whatsapp} detail={`Session: ${session.status.replaceAll("_", " ")}`} /></section>
      <WhatsAppSessionPanel readiness={readiness} session={session} />
      <WhatsAppQrPanel active={session.status === "pending_qr"} />
      <ConversationSimulator enabled={readiness.simulation_enabled} />
    </div>;
  } catch (error) { return <SetupError message={safeSetupErrorMessage(error)} />; }
}
