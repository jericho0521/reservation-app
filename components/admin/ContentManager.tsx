"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ExternalLink, Pencil, Plus, X } from "lucide-react";
import { getSectionLabels, type BlogPostRecord, type ContentSectionType } from "@/lib/blogs";
import { AdminShell } from "@/components/admin/AdminShell";

interface ContentManagerProps {
  section: ContentSectionType;
  posts: BlogPostRecord[];
  userEmail: string;
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
};

const STATUS_HINTS: Record<string, string> = {
  draft: "Not visible to customers yet",
  published: "Live on the public site",
  archived: "Hidden from the public site",
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-MY", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function ContentManager({ section, posts, userEmail }: ContentManagerProps) {
  const labels = getSectionLabels(section);
  const router = useRouter();
  const [notice, setNotice] = useState<{ tone: "error" | "success"; message: string } | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const singular = labels.singular.toLowerCase();
  const plural = labels.plural.toLowerCase();
  const publishedCount = posts.filter(post => post.status === "published").length;

  const archivePost = async (post: BlogPostRecord) => {
    const confirmed = window.confirm(
      `Archive "${post.title}"?\n\nIt will be hidden from the public site. You can bring it back later by editing it and setting its status to Published.`,
    );
    if (!confirmed) return;

    setArchivingId(post.id);
    setNotice(null);

    try {
      const response = await fetch(`/api/${section === "blog" ? "blogs" : "updates"}/${post.id}`, {
        method: "DELETE",
      });


      if (!response.ok) {
        setNotice({ tone: "error", message: `"${post.title}" could not be archived. Try again.` });
        return;
      }

      setNotice({ tone: "success", message: `"${post.title}" is archived and no longer public.` });
      router.refresh();
    } catch {
      setNotice({ tone: "error", message: `"${post.title}" could not be archived. Check your connection and try again.` });
    } finally {
      setArchivingId(null);
    }
  };

  return (
    <AdminShell userEmail={userEmail}>
      <div className="admin-dashboard admin-content-page">
        <header className="admin-page-header">
          <div>
            <span className="admin-eyebrow">Content</span>
            <h1>{labels.plural}</h1>
            <p>Write, publish, and archive {plural}. Only published items appear on the public site.</p>
          </div>
          <Link href={`${labels.adminPath}/new`} className="admin-primary-button">
            <Plus aria-hidden="true" /> New {singular}
          </Link>
        </header>

        {notice && (
          <div className={`admin-notice ${notice.tone === "error" ? "is-error" : "is-success"}`} role="status">
            <span>{notice.message}</span>
            <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss message"><X aria-hidden="true" /></button>
          </div>
        )}

        <div className="admin-table-meta">
          <span>{posts.length} {posts.length === 1 ? singular : plural}</span>
          <span>{publishedCount} published</span>
        </div>

        <div className="admin-table-frame">
          <div className="admin-table-scroll">
            <table className="admin-bookings-table admin-content-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Published</th>
                  <th>Last edited</th>
                  <th><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {posts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="admin-table-empty">
                      No {plural} yet. Use “New {singular}” to write the first one.
                    </td>
                  </tr>
                ) : posts.map((post) => (
                  <tr key={post.id}>
                    <td>
                      <Link href={`${labels.adminPath}/${post.id}`} className="admin-customer-link">{post.title}</Link>
                      <span>{labels.publicPath}/{post.slug}</span>
                    </td>
                    <td>
                      <span className={`admin-status-badge status-${post.status}`} title={STATUS_HINTS[post.status]}>
                        {STATUS_LABELS[post.status] ?? post.status}
                      </span>
                    </td>
                    <td>{formatDate(post.published_at)}</td>
                    <td>{formatDate(post.updated_at)}</td>
                    <td>
                      <div className="admin-row-actions">
                        <Link href={`${labels.adminPath}/${post.id}`} className="admin-view-button">
                          <Pencil aria-hidden="true" /> Edit
                        </Link>
                        {post.status === "published" && (
                          <a
                            href={`${labels.publicPath}/${post.slug}`}
                            target="_blank"
                            rel="noreferrer"
                            className="admin-view-button"
                            title="Opens the public page in a new tab"
                          >
                            <ExternalLink aria-hidden="true" /> View live
                          </a>
                        )}
                        {post.status !== "archived" && (
                          <button
                            type="button"
                            onClick={() => void archivePost(post)}
                            disabled={archivingId === post.id}
                            className="admin-view-button is-danger"
                          >
                            <Archive aria-hidden="true" /> {archivingId === post.id ? "Archiving" : "Archive"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
