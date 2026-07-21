"use client";

import { useActionState } from "react";
import type { KnowledgeSourceResponse } from "@reservation-platform/sdk";
import {
  archiveKnowledgeSourceAction,
  createKnowledgeSourceAction,
  reindexKnowledgeSourceAction,
  replaceKnowledgeSourceAction,
  testKnowledgeSearchAction,
  type KnowledgeSearchActionState,
  type StudioActionState,
} from "../../app/studio/actions";

const initialState: StudioActionState = { status: "idle", message: "" };
const initialSearchState: KnowledgeSearchActionState = { status: "idle", message: "", matches: [] };

function KnowledgeSourceRow({ source }: { source: KnowledgeSourceResponse }) {
  const [replaceState, replaceAction, replacing] = useActionState(replaceKnowledgeSourceAction, initialState);
  return <article className={`catalog-editor ${source.status === "archived" ? "archived" : ""}`}>
    <div>
      <span className="eyebrow">{source.kind} · {source.status}</span>
      <h3>{source.title}</h3>
      <p>{source.source_label} · {source.chunk_count} chunks{source.indexed_at ? ` · indexed ${new Date(source.indexed_at).toLocaleString()}` : ""}</p>
      {source.failure_code ? <p className="form-message error">Indexing failed: {source.failure_code}</p> : null}
    </div>
    {source.status !== "archived" ? <>
      <form action={replaceAction} className="studio-form">
        <input type="hidden" name="source_id" value={source.source_id} />
        <label>Title<input name="title" defaultValue={source.title} maxLength={160} required /></label>
        <label>Source label<input name="source_label" defaultValue={source.source_label} maxLength={160} required /></label>
        <label>Replacement text<textarea name="content" rows={4} maxLength={100000} /></label>
        <label>Or replacement PDF<input name="file" type="file" accept="application/pdf" /></label>
        <p className={`form-message ${replaceState.status}`} aria-live="polite">{replaceState.message}</p>
        <button type="submit" disabled={replacing}>{replacing ? "Replacing…" : "Replace content"}</button>
      </form>
      <div className="form-footer">
        <form action={reindexKnowledgeSourceAction}>
          <input type="hidden" name="source_id" value={source.source_id} />
          <button type="submit">Reindex</button>
        </form>
        <form action={archiveKnowledgeSourceAction}>
          <input type="hidden" name="source_id" value={source.source_id} />
          <button type="submit">Archive</button>
        </form>
      </div>
    </> : null}
  </article>;
}

export function KnowledgeSourceEditor({ sources }: { sources: KnowledgeSourceResponse[] }) {
  const [state, action, pending] = useActionState(createKnowledgeSourceAction, initialState);
  const [searchState, searchAction, searching] = useActionState(testKnowledgeSearchAction, initialSearchState);
  return <div className="page-stack"><section className="panel page-stack">
    <header>
      <span className="eyebrow">Documents</span>
      <h2>Add business knowledge</h2>
      <p>Paste approved text or upload a text-based PDF. Indexing runs locally and never uses your AI-provider credits.</p>
    </header>
    <form action={action} className="studio-form">
      <label>Title<input name="title" maxLength={160} required /></label>
      <label>Customer-visible source label<input name="source_label" maxLength={160} required /></label>
      <label>Paste text<textarea name="content" rows={8} maxLength={100000} /></label>
      <label>Or upload PDF<input name="file" type="file" accept="application/pdf" /></label>
      <div className="form-footer">
        <p className={`form-message ${state.status}`} aria-live="polite">{state.message}</p>
        <button className="primary-action" disabled={pending}>{pending ? "Adding…" : "Add knowledge source"}</button>
      </div>
    </form>
    <div className="catalog-stack">
      {sources.map((source) => <KnowledgeSourceRow key={source.source_id} source={source} />)}
    </div>
  </section>
  <section className="panel page-stack">
    <header>
      <span className="eyebrow">Test retrieval</span>
      <h2>Preview what the assistant can find</h2>
      <p>This runs local semantic and lexical search only. It does not call your AI provider or consume provider credits.</p>
    </header>
    <form action={searchAction} className="studio-form">
      <label>Sample customer question<input name="query" maxLength={4000} required /></label>
      <div className="form-footer">
        <p className={`form-message ${searchState.status}`} aria-live="polite">{searchState.message}</p>
        <button className="primary-action" disabled={searching}>{searching ? "Searching…" : "Test retrieval"}</button>
      </div>
    </form>
    <div className="catalog-stack">
      {searchState.matches?.map((match) => <article className="catalog-editor" key={match.chunk_id}>
        <div>
          <span className="eyebrow">{match.source_label}</span>
          <p>{match.excerpt}</p>
          <p>
            Final score {match.combined_score.toFixed(5)}
            {match.semantic_similarity !== undefined ? ` · semantic ${match.semantic_similarity.toFixed(3)}` : ""}
            {match.lexical_rank !== undefined ? ` · lexical rank ${match.lexical_rank}` : ""}
          </p>
        </div>
      </article>)}
    </div>
  </section></div>;
}
