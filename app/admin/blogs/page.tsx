import type { Metadata } from "next";
import { ContentManager } from "@/components/admin/ContentManager";
import { loadAdminContentList } from "@/app/admin/content-pages";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Blog posts · Admin" };

export default async function AdminBlogsPage() {
  const { posts, userEmail } = await loadAdminContentList("blog");

  return <ContentManager section="blog" posts={posts} userEmail={userEmail} />;
}
