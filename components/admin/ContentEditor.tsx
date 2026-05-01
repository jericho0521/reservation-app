"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save } from "lucide-react";
import { blogPostToFormData, getSectionLabels, type BlogPostRecord, type ContentSectionType } from "@/lib/blogs";
import { MarkdownContent } from "@/components/content/MarkdownContent";
import { Sidebar } from "@/components/admin/Sidebar";

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

export function ContentEditor({ section, post, userEmail }: ContentEditorProps) {
  const labels = getSectionLabels(section);
  const router = useRouter();
  const [form, setForm] = useState<FormData>(post ? blogPostToFormData(post) : emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const apiBase = section === "blog" ? "/api/blogs" : "/api/updates";

  const setField = (field: keyof FormData, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);

    const response = await fetch(post ? `${apiBase}/${post.id}` : apiBase, {
      method: post ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(typeof body.error === "string" ? body.error : "Failed to save content");
      setIsSaving(false);
      return;
    }

    router.push(labels.adminPath);
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-racing-dark text-white">
      <Sidebar title="Admin Panel" subtitle={userEmail} />
      <div className="ml-[76px] transition-all duration-300">
        <header className="sticky top-0 z-10 border-b border-white/10 bg-white/5 backdrop-blur-md">
          <div className="container mx-auto flex items-center justify-between px-6 py-4">
            <div>
              <Link href={labels.adminPath} className="mb-2 inline-flex items-center gap-2 text-sm text-gray-400 hover:text-neon">
                <ArrowLeft className="h-4 w-4" /> Back to {labels.plural}
              </Link>
              <h1 className="text-2xl font-bold font-heading">{post ? "Edit" : "New"} {labels.singular}</h1>
            </div>
          </div>
        </header>

        <main className="container mx-auto grid gap-6 px-6 py-8 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
          <form onSubmit={save} className="space-y-5 rounded-xl border border-white/10 bg-white/[0.04] p-6">
            {error && <div className="rounded-lg border border-red-500/40 bg-red-500/15 px-4 py-3 text-sm text-red-200">{error}</div>}

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-gray-300">Title</span>
              <input value={form.title} onChange={(event) => setField("title", event.target.value)} required className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-3 outline-none focus:border-neon" />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-gray-300">Slug</span>
              <input value={form.slug} onChange={(event) => setField("slug", event.target.value)} placeholder="Auto-generated from title if empty" className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-3 outline-none focus:border-neon" />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-gray-300">Excerpt</span>
              <textarea value={form.excerpt} onChange={(event) => setField("excerpt", event.target.value)} rows={3} placeholder="Auto-generated from content if empty" className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-3 outline-none focus:border-neon" />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-gray-300">Markdown Content</span>
              <textarea value={form.content} onChange={(event) => setField("content", event.target.value)} required rows={16} className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-3 font-mono text-sm outline-none focus:border-neon" />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-gray-300">Cover Image URL</span>
              <input value={form.coverImageUrl} onChange={(event) => setField("coverImageUrl", event.target.value)} className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-3 outline-none focus:border-neon" />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-gray-300">Status</span>
                <select value={form.status} onChange={(event) => setField("status", event.target.value)} className="w-full rounded-lg border border-white/20 bg-racing-dark px-4 py-3 outline-none focus:border-neon">
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                  <option value="archived">Archived</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-gray-300">Published At</span>
                <input value={form.publishedAt ?? ""} onChange={(event) => setField("publishedAt", event.target.value)} placeholder="Auto-filled when published" className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-3 outline-none focus:border-neon" />
              </label>
            </div>

            {section === "blog" && (
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-gray-300">SEO Title</span>
                  <input value={form.seoTitle} onChange={(event) => setField("seoTitle", event.target.value)} className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-3 outline-none focus:border-neon" />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-gray-300">SEO Description</span>
                  <input value={form.seoDescription} onChange={(event) => setField("seoDescription", event.target.value)} className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-3 outline-none focus:border-neon" />
                </label>
              </div>
            )}

            <button type="submit" disabled={isSaving} className="inline-flex items-center gap-2 rounded-lg bg-neon px-5 py-3 font-bold text-racing-dark hover:bg-white disabled:opacity-50">
              <Save className="h-4 w-4" /> {isSaving ? "Saving..." : "Save"}
            </button>
          </form>

          <aside className="rounded-xl border border-white/10 bg-white/[0.04] p-6">
            <h2 className="mb-4 text-lg font-bold font-heading">Preview</h2>
            <div className="rounded-lg border border-white/10 bg-racing-dark/80 p-5">
              <h3 className="mb-3 text-2xl font-bold font-heading">{form.title || "Untitled"}</h3>
              {form.excerpt && <p className="mb-6 text-sm text-gray-400">{form.excerpt}</p>}
              <MarkdownContent content={form.content || "Start writing to preview Markdown."} />
            </div>
          </aside>
        </main>
      </div>
    </div>
  );
}
