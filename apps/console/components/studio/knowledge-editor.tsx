"use client";

import { useActionState } from "react";
import type { ExperienceKnowledgeEntryResponse } from "@reservation-platform/sdk";
import { archiveKnowledgeAction, saveKnowledgeAction, type StudioActionState } from "../../app/studio/actions";

const initialState: StudioActionState = { status: "idle", message: "" };

export function KnowledgeEditor({ entry }: { entry?: ExperienceKnowledgeEntryResponse }) {
  const [state, action, pending] = useActionState(saveKnowledgeAction, initialState);
  const archived = entry?.status === "archived";
  return <article className={`catalog-editor ${archived ? "archived" : ""}`}>
    <form action={action} className="studio-form">
      <input type="hidden" name="knowledge_id" value={entry?.knowledge_id ?? ""} />
      <label>Customer question<input name="question" defaultValue={entry?.question ?? ""} maxLength={300} required /></label>
      <label>Approved answer<textarea name="answer" defaultValue={entry?.answer ?? ""} rows={4} maxLength={4000} required /></label>
      <label>Source or owner note<input name="source" defaultValue={entry?.source ?? ""} maxLength={500} /></label>
      <div className="form-footer">
        <p className={`form-message ${state.status}`} aria-live="polite">{archived ? "Archived entries are retained for audit." : state.message}</p>
        <button className="primary-action" disabled={pending || archived}>{pending ? "Saving…" : entry ? "Update answer" : "Add answer"}</button>
      </div>
    </form>
    {entry && !archived ? <form action={archiveKnowledgeAction} className="archive-form">
      <input type="hidden" name="knowledge_id" value={entry.knowledge_id} />
      <button type="submit">Archive answer</button>
    </form> : null}
  </article>;
}
