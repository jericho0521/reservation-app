import Header from "@/components/shared/Header";
import Footer from "@/components/shared/Footer";
import FloatingChat from "@/components/chat/FloatingChat";
import { PublicContentList } from "@/components/content/PublicContentList";
import { listPublishedContentPosts } from "@/lib/content-posts";

export const dynamic = "force-dynamic";

export default async function BlogPage() {
  const posts = await listPublishedContentPosts("blog");

  return (
    <>
      <Header />
      <PublicContentList section="blog" posts={posts} />
      <Footer />
      <FloatingChat />
    </>
  );
}
