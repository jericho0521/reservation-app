"use client";

import { useMemo, useState } from "react";
import { createReservationPlatformClient } from "@reservation-platform/sdk";
import { ChatWidget, usePublicChat } from "@reservation-platform/ui";

export function PublicChat({ baseUrl, slug, brandName }: { baseUrl: string; slug: string; brandName: string }) {
  const client = useMemo(() => createReservationPlatformClient({ baseUrl }), [baseUrl]);
  const { state, send, confirm, retry } = usePublicChat({ client, slug });
  const [draft, setDraft] = useState("");
  return <ChatWidget
    brandName={brandName}
    messages={state.messages}
    proposal={state.proposal}
    reservation={state.reservation}
    draft={draft}
    loading={state.loading}
    restoring={state.restoring}
    error={state.error}
    canRetry={Boolean(state.failedMessage)}
    handoff={state.handoff}
    onDraftChange={setDraft}
    onSend={(content) => { setDraft(""); void send(content); }}
    onConfirm={() => { void confirm(); }}
    onRetry={() => { void retry(); }}
  />;
}
