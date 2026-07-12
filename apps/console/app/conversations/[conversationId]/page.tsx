import { notFound } from "next/navigation";
import { ConversationThread } from "../../../components/inbox/conversation-thread";
import { InboxRefresh } from "../../../components/inbox/inbox-refresh";
import { TakeoverControls } from "../../../components/inbox/takeover-controls";
import { createConsolePlatformClient } from "../../../lib/platform-client";

export const dynamic = "force-dynamic";

export default async function ConversationPage({ params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await params;
  const client = createConsolePlatformClient();
  try {
    const [conversation, timeline] = await Promise.all([client.getConversation(conversationId), client.listConversationMessages(conversationId, { limit: 100 })]);
    return <div className="page-stack"><div className="conversation-page-toolbar"><a href="/conversations">← Back to inbox</a><InboxRefresh /></div><div className="conversation-detail-layout"><ConversationThread conversation={conversation} messages={timeline.messages} /><TakeoverControls conversation={conversation} /></div></div>;
  } catch (error) { if (error && typeof error === "object" && "body" in error && (error as { body?: { status?: number } }).body?.status === 404) notFound(); throw error; }
}
