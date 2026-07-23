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
        <span className="eyebrow">Hybrid RAG Retrieval Pipeline</span>
        <h2>How your knowledge is processed</h2>
        <p>Local embeddings process your documents without consuming AI provider tokens. The AI provider generates final answers using customer-safe excerpts.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(11rem, 1fr))", gap: "0.75rem", marginTop: "1rem" }}>
          <div style={{ padding: "0.75rem", border: "1px solid var(--border)", borderRadius: "0.375rem", background: "var(--panel-subtle)" }}>
            <strong style={{ fontSize: "0.8125rem" }}>1. Knowledge Added</strong>
            <p style={{ margin: "0.25rem 0 0", fontSize: "0.75rem", color: "var(--muted)" }}>Owner uploads FAQs, text, or PDFs</p>
          </div>
          <div style={{ padding: "0.75rem", border: "1px solid var(--border)", borderRadius: "0.375rem", background: "var(--panel-subtle)" }}>
            <strong style={{ fontSize: "0.8125rem" }}>2. Extraction & Chunking</strong>
            <p style={{ margin: "0.25rem 0 0", fontSize: "0.75rem", color: "var(--muted)" }}>Worker parses text & splits sections</p>
          </div>
          <div style={{ padding: "0.75rem", border: "1px solid var(--border)", borderRadius: "0.375rem", background: "var(--panel-subtle)" }}>
            <strong style={{ fontSize: "0.8125rem" }}>3. Local Embeddings</strong>
            <p style={{ margin: "0.25rem 0 0", fontSize: "0.75rem", color: "var(--muted)" }}>Zero-cost multilingual vector index</p>
          </div>
          <div style={{ padding: "0.75rem", border: "1px solid var(--border)", borderRadius: "0.375rem", background: "var(--panel-subtle)" }}>
            <strong style={{ fontSize: "0.8125rem" }}>4. Hybrid Retrieval</strong>
            <p style={{ margin: "0.25rem 0 0", fontSize: "0.75rem", color: "var(--muted)" }}>Postgres full-text + vector search</p>
          </div>
          <div style={{ padding: "0.75rem", border: "1px solid var(--border)", borderRadius: "0.375rem", background: "var(--panel-subtle)" }}>
            <strong style={{ fontSize: "0.8125rem" }}>5. Assistant Response</strong>
            <p style={{ margin: "0.25rem 0 0", fontSize: "0.75rem", color: "var(--muted)" }}>Delivered via Web Chat & WhatsApp</p>
          </div>
        </div>
      </section>
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
