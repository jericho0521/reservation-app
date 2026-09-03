import type { Metadata } from "next";
import { ContentManager } from "@/components/admin/ContentManager";
import { loadAdminContentList } from "@/app/admin/content-pages";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Updates · Admin" };

export default async function AdminUpdatesPage() {
  const { posts, userEmail } = await loadAdminContentList("update");

  return <ContentManager section="update" posts={posts} userEmail={userEmail} />;
}
