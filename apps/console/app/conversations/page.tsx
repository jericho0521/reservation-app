import type { ConversationChannel } from "@reservation-platform/sdk";
import { ConversationList } from "../../components/inbox/conversation-list";
import { InboxRefresh } from "../../components/inbox/inbox-refresh";
import { SetupError, safeSetupErrorMessage } from "../../components/setup-error";
import { createConsolePlatformClient } from "../../lib/platform-client";

export const dynamic = "force-dynamic";

export default async function ConversationsPage({ searchParams }: { searchParams: Promise<{ channel?: string }> }) {
  try {
    const channelValue = (await searchParams).channel;
    const channel = channelValue === "web_chat" || channelValue === "whatsapp" || channelValue === "simulation" ? channelValue as ConversationChannel : undefined;
    const result = await createConsolePlatformClient().listConversations({ ...(channel ? { channel } : {}), limit: 100 });
    return <div className="page-stack"><header className="page-header split-header"><div><span className="eyebrow">Unified inbox</span><h1>Every customer conversation</h1><p>Web chat, WhatsApp, and simulation share one timeline and one staff takeover state.</p></div><InboxRefresh /></header><ConversationList conversations={result.conversations} channel={channel} /></div>;
  } catch (error) { return <SetupError message={safeSetupErrorMessage(error)} />; }
}
