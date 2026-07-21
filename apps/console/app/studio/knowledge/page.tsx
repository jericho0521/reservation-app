import { ChannelSettings } from "../../../components/studio/channel-settings";
import { KnowledgeEditor } from "../../../components/studio/knowledge-editor";
import { KnowledgeSourceEditor } from "../../../components/studio/knowledge-source-editor";
import { SetupError, safeSetupErrorMessage } from "../../../components/setup-error";
import { createConsolePlatformClient } from "../../../lib/platform-client";

export const dynamic = "force-dynamic";

export default async function KnowledgePage() {
  try {
    const client = createConsolePlatformClient();
    const [{ entries }, { sources }, channels] = await Promise.all([
      client.listExperienceKnowledge(true),
      client.listKnowledgeSources(true),
      client.getExperienceChannelSettings(),
    ]);
    const faqSources = sources.filter((source) => source.kind === "faq");
    return <div className="page-stack">
      <header className="page-header">
        <span className="eyebrow">Experience Studio</span>
        <h1>Knowledge & channels</h1>
        <p>Approve concise answers for conversational booking and choose which customer channels you want to offer.</p>
      </header>
      <section className="panel">
        <h2>Channel preferences</h2>
        <p>Enablement expresses intent. The readiness badge separately shows whether each runtime can serve customers.</p>
        <ChannelSettings value={channels} />
      </section>
      <section className="catalog-stack">
        <header><span className="eyebrow">FAQs</span><h2>Approved questions and answers</h2></header>
        {faqSources.length ? <p className="muted">
          Indexing: {faqSources.filter((source) => source.status === "ready").length} ready · {faqSources.filter((source) => source.status === "pending" || source.status === "indexing").length} processing · {faqSources.filter((source) => source.status === "failed").length} failed
        </p> : null}
        <KnowledgeEditor />
        {entries.map((entry) => <KnowledgeEditor key={entry.knowledge_id} entry={entry} />)}
      </section>
      <KnowledgeSourceEditor sources={sources.filter((source) => source.kind !== "faq")} />
    </div>;
  } catch (error) {
    return <SetupError message={safeSetupErrorMessage(error)} />;
  }
}
