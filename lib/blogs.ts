import { z } from "zod";

export const contentSectionTypes = ["blog", "update"] as const;
export type ContentSectionType = (typeof contentSectionTypes)[number];

export const blogPostStatuses = ["draft", "published", "archived"] as const;
export type BlogPostStatus = (typeof blogPostStatuses)[number];

export interface BlogPostRecord {
  id: string;
  section: ContentSectionType;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  cover_image_url: string | null;
  status: BlogPostStatus;
  published_at: string | null;
  author_id: string | null;
  seo_title: string | null;
  seo_description: string | null;
  created_at: string;
  updated_at: string;
}

export const blogPostInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  slug: z.string().optional().nullable(),
  excerpt: z.string().optional().nullable(),
  content: z.string().trim().min(1, "Content is required"),
  coverImageUrl: z.string().optional().nullable(),
  status: z.enum(blogPostStatuses).optional().default("draft"),
  publishedAt: z.string().optional().nullable(),
  seoTitle: z.string().optional().nullable(),
  seoDescription: z.string().optional().nullable(),
});

export type BlogPostInput = z.infer<typeof blogPostInputSchema>;

export interface NormalizedBlogPostInput {
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  coverImageUrl: string | null;
  status: BlogPostStatus;
  publishedAt: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
}

function nullableTrim(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function slugifyBlogTitle(title: string) {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return slug || "post";
}

export function buildBlogExcerpt(content: string, maxLength = 160) {
  const plain = content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_~\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (plain.length <= maxLength) {
    return plain;
  }

  return `${plain.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

export function normalizeBlogPostInput(input: unknown): NormalizedBlogPostInput {
  const parsed = blogPostInputSchema.parse(input);
  const title = parsed.title.trim();
  const status = parsed.status;

  return {
    title,
    slug: slugifyBlogTitle(parsed.slug || title),
    excerpt: nullableTrim(parsed.excerpt) ?? buildBlogExcerpt(parsed.content),
    content: parsed.content.trim(),
    coverImageUrl: nullableTrim(parsed.coverImageUrl),
    status,
    publishedAt: status === "published" ? parsed.publishedAt || new Date().toISOString() : null,
    seoTitle: nullableTrim(parsed.seoTitle),
    seoDescription: nullableTrim(parsed.seoDescription),
  };
}

export function blogPostToFormData(post: BlogPostRecord) {
  return {
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt ?? "",
    content: post.content,
    coverImageUrl: post.cover_image_url ?? "",
    status: post.status,
    publishedAt: post.published_at,
    seoTitle: post.seo_title ?? "",
    seoDescription: post.seo_description ?? "",
  };
}

export function getSectionLabels(section: ContentSectionType) {
  return section === "blog"
    ? { singular: "Blog Post", plural: "Blog Posts", publicPath: "/blog", adminPath: "/admin/blogs" }
    : { singular: "Update", plural: "Updates", publicPath: "/updates", adminPath: "/admin/updates" };
}
