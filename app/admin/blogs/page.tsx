import { ContentManager } from "@/components/admin/ContentManager";
import { loadAdminContentList } from "@/app/admin/content-pages";

export const dynamic = "force-dynamic";

export default async function AdminBlogsPage() {
  const { posts, userEmail } = await loadAdminContentList("blog");

  return <ContentManager section="blog" posts={posts} userEmail={userEmail} />;
}
