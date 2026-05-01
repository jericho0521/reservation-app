"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Edit, ExternalLink, Plus, Trash2 } from "lucide-react";
import { getSectionLabels, type BlogPostRecord, type ContentSectionType } from "@/lib/blogs";
import { Sidebar } from "@/components/admin/Sidebar";

interface ContentManagerProps {
  section: ContentSectionType;
  posts: BlogPostRecord[];
  userEmail: string;
}

function formatDate(value: string | null) {
  if (!value) return "Not published";
  return new Intl.DateTimeFormat("en-MY", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function statusClass(status: string) {
  if (status === "published") return "border-green-500/30 bg-green-500/20 text-green-300";
  if (status === "archived") return "border-gray-500/30 bg-gray-500/20 text-gray-300";
  return "border-yellow-500/30 bg-yellow-500/20 text-yellow-300";
}

export function ContentManager({ section, posts, userEmail }: ContentManagerProps) {
  const labels = getSectionLabels(section);
  const router = useRouter();

  const archivePost = async (post: BlogPostRecord) => {
    if (!window.confirm(`Archive "${post.title}"?`)) return;

    const response = await fetch(`/api/${section === "blog" ? "blogs" : "updates"}/${post.id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      alert("Failed to archive content");
      return;
    }

    router.refresh();
  };

  return (
    <div className="min-h-screen bg-racing-dark text-white">
      <Sidebar title="Admin Panel" subtitle={userEmail} />
      <div className="ml-[76px] transition-all duration-300">
        <header className="sticky top-0 z-10 border-b border-white/10 bg-white/5 backdrop-blur-md">
          <div className="container mx-auto flex items-center justify-between px-6 py-4">
            <div>
              <h1 className="text-2xl font-bold font-heading">{labels.plural}</h1>
              <p className="text-sm text-gray-400">Create, publish, and archive {labels.plural.toLowerCase()}.</p>
            </div>
            <Link href={`${labels.adminPath}/new`} className="inline-flex items-center gap-2 rounded-lg bg-neon px-4 py-2 text-sm font-bold text-racing-dark hover:bg-white">
              <Plus className="h-4 w-4" /> New {labels.singular}
            </Link>
          </div>
        </header>

        <main className="container mx-auto px-6 py-8">
          <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]">
            <table className="w-full">
              <thead className="bg-white/5 text-left text-sm text-gray-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Title</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Published</th>
                  <th className="px-4 py-3 font-medium">Updated</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {posts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-gray-400">No content yet.</td>
                  </tr>
                ) : posts.map((post) => (
                  <tr key={post.id} className="hover:bg-white/5">
                    <td className="px-4 py-4">
                      <div className="font-medium">{post.title}</div>
                      <div className="text-xs text-gray-500">/{post.slug}</div>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`rounded-full border px-2 py-1 text-xs ${statusClass(post.status)}`}>{post.status}</span>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-300">{formatDate(post.published_at)}</td>
                    <td className="px-4 py-4 text-sm text-gray-300">{formatDate(post.updated_at)}</td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-2">
                        <Link href={`${labels.adminPath}/${post.id}`} className="inline-flex items-center gap-1 rounded border border-white/20 px-2 py-1 text-xs hover:bg-white/10">
                          <Edit className="h-3 w-3" /> Edit
                        </Link>
                        {post.status === "published" && (
                          <Link href={`${labels.publicPath}/${post.slug}`} target="_blank" className="inline-flex items-center gap-1 rounded border border-white/20 px-2 py-1 text-xs hover:bg-white/10">
                            <ExternalLink className="h-3 w-3" /> View
                          </Link>
                        )}
                        {post.status !== "archived" && (
                          <button onClick={() => archivePost(post)} className="inline-flex items-center gap-1 rounded border border-red-500/30 px-2 py-1 text-xs text-red-300 hover:bg-red-500/10">
                            <Trash2 className="h-3 w-3" /> Archive
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    </div>
  );
}
