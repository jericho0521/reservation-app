"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save } from "lucide-react";
import { blogPostToFormData, getSectionLabels, type BlogPostRecord, type ContentSectionType } from "@/lib/blogs";
import { MarkdownContent } from "@/components/content/MarkdownContent";
import { AdminShell } from "@/components/admin/AdminShell";

type FormData = ReturnType<typeof blogPostToFormData>;

interface ContentEditorProps {
  section: ContentSectionType;
  post?: BlogPostRecord | null;
  userEmail: string;
}

const emptyForm: FormData = {
  title: "",
  slug: "",
  excerpt: "",
  content: "",
  coverImageUrl: "",
  status: "draft",
  publishedAt: null,
  seoTitle: "",
  seoDescription: "",
};

const STATUS_HELP: Record<string, string> = {
  draft: "Saved privately. Customers cannot see it.",
  published: "Live on the public site as soon as you save.",
  archived: "Hidden from the public site but kept here.",
};

export function ContentEditor({ section, post, userEmail }: ContentEditorProps) {
  const labels = getSectionLabels(section);
  const router = useRouter();
  const [form, setForm] = useState<FormData>(post ? blogPostToFormData(post) : emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const apiBase = section === "blog" ? "/api/blogs" : "/api/updates";
  const singular = labels.singular.toLowerCase();

  const setField = (field: keyof FormData, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(post ? `${apiBase}/${post.id}` : apiBase, {
        method: post ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(typeof body.error === "string" ? body.error : `The ${singular} could not be saved. Try again.`);
        return;
      }

      router.push(labels.adminPath);
      router.refresh();
    } catch {
      setError(`The ${singular} could not be saved. Check your connection and try again.`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AdminShell userEmail={userEmail}>
      <div className="admin-dashboard admin-content-page">
        <header className="admin-page-header">
          <div>
            <Link href={labels.adminPath} className="admin-back-link">
              <ArrowLeft aria-hidden="true" /> Back to {labels.plural.toLowerCase()}
            </Link>
            <h1>{post ? `Edit ${singular}` : `New ${singular}`}</h1>
            <p>
              {form.status === "published"
                ? "This item is live. Saving publishes your edits immediately."
                : `Saved as a ${form.status}. Set the status to Published when it is ready for customers.`}
            </p>
          </div>
          <button type="submit" form="content-editor-form" disabled={isSaving} className="admin-primary-button">
            <Save aria-hidden="true" /> {isSaving ? "Saving" : form.status === "published" ? "Save and publish" : "Save"}
          </button>
        </header>

        <div className="admin-editor-layout">
          <form id="content-editor-form" onSubmit={save} className="admin-form">
            {error && <div className="admin-notice is-error" role="alert"><span>{error}</span></div>}

            <fieldset className="admin-fieldset">
              <legend className="admin-eyebrow">Basics</legend>

              <label className="admin-field">
                <span>Title</span>
                <input value={form.title} onChange={(event) => setField("title", event.target.value)} required />
              </label>

              <label className="admin-field">
                <span>Web address (slug) <small>optional</small></span>
                <input value={form.slug} onChange={(event) => setField("slug", event.target.value)} placeholder="Created from the title if left empty" />
                <em>Appears as {labels.publicPath}/{form.slug || "your-title"}</em>
              </label>

              <label className="admin-field">
                <span>Summary <small>optional</small></span>
                <textarea value={form.excerpt} onChange={(event) => setField("excerpt", event.target.value)} rows={3} placeholder="Short teaser shown in lists. Created from the content if left empty." />
              </label>
            </fieldset>

            <fieldset className="admin-fieldset">
              <legend className="admin-eyebrow">Content</legend>

              <label className="admin-field">
                <span>Body <small>Markdown</small></span>
                <textarea value={form.content} onChange={(event) => setField("content", event.target.value)} required rows={16} className="is-mono" />
                <em>Use # for headings, **bold**, and blank lines between paragraphs. The preview on the right updates as you type.</em>
              </label>

              <label className="admin-field">
                <span>Cover image URL <small>optional</small></span>
                <input value={form.coverImageUrl} onChange={(event) => setField("coverImageUrl", event.target.value)} placeholder="/images/cover.jpg or your public blog-assets URL" />
              </label>
            </fieldset>

            <fieldset className="admin-fieldset">
              <legend className="admin-eyebrow">Visibility</legend>

              <div className="admin-field-grid">
                <label className="admin-field">
                  <span>Status</span>
                  <select value={form.status} onChange={(event) => setField("status", event.target.value)}>
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    <option value="archived">Archived</option>
                  </select>
                  <em>{STATUS_HELP[form.status]}</em>
                </label>
                <label className="admin-field">
                  <span>Publish date <small>optional</small></span>
                  <input value={form.publishedAt ?? ""} onChange={(event) => setField("publishedAt", event.target.value)} placeholder="2026-09-08T12:00:00+08:00 (optional)" />
                </label>
              </div>
            </fieldset>

            {section === "blog" && (
              <fieldset className="admin-fieldset">
                <legend className="admin-eyebrow">Search engines <small>optional</small></legend>

                <div className="admin-field-grid">
                  <label className="admin-field">
                    <span>SEO title</span>
                    <input value={form.seoTitle} onChange={(event) => setField("seoTitle", event.target.value)} placeholder="Defaults to the title" />
                  </label>
                  <label className="admin-field">
                    <span>SEO description</span>
                    <input value={form.seoDescription} onChange={(event) => setField("seoDescription", event.target.value)} placeholder="Defaults to the summary" />
                  </label>
                </div>
              </fieldset>
            )}

            <div className="admin-form-footer">
              <Link href={labels.adminPath} className="admin-secondary-button">Cancel</Link>
              <button type="submit" disabled={isSaving} className="admin-primary-button">
                <Save aria-hidden="true" /> {isSaving ? "Saving" : form.status === "published" ? "Save and publish" : "Save"}
              </button>
            </div>
          </form>

          <aside className="admin-preview" aria-label="Live preview">
            <div className="admin-section-heading">
              <span className="admin-eyebrow">Preview</span>
              <h2>How customers will see it</h2>
            </div>
            <div className="admin-preview-body">
              <h3>{form.title || "Untitled"}</h3>
              {form.excerpt && <p className="admin-preview-excerpt">{form.excerpt}</p>}
              <MarkdownContent content={form.content || "Start writing to see the preview."} />
            </div>
          </aside>
        </div>
      </div>
    </AdminShell>
  );
}
