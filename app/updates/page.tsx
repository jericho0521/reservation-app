import Header from "@/components/shared/Header";
import Footer from "@/components/shared/Footer";
import FloatingChat from "@/components/chat/FloatingChat";
import { PublicContentList } from "@/components/content/PublicContentList";
import { listPublishedContentPosts } from "@/lib/content-posts";

export const dynamic = "force-dynamic";

export default async function UpdatesPage() {
  const posts = await listPublishedContentPosts("update");

  return (
    <>
      <Header />
      <PublicContentList section="update" posts={posts} />
      <Footer />
      <FloatingChat />
    </>
  );
}
