import type { Metadata } from "next";
import Header from "@/components/shared/Header";
import Footer from "@/components/shared/Footer";
import FloatingChat from "@/components/chat/FloatingChat";
import { PublicContentDetail } from "@/components/content/PublicContentDetail";
import { getPublishedContentPostBySlug } from "@/lib/content-posts";

interface BlogDetailPageProps {
  params: Promise<{ slug: string }>;
}

export const revalidate = 300;

export async function generateMetadata({ params }: BlogDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedContentPostBySlug("blog", slug);

  return {
    title: post.seo_title || post.title,
    description: post.seo_description || post.excerpt || undefined,
  };
}

export default async function BlogDetailPage({ params }: BlogDetailPageProps) {
  const { slug } = await params;
  const post = await getPublishedContentPostBySlug("blog", slug);

  return (
    <>
      <Header />
      <PublicContentDetail section="blog" post={post} />
      <Footer />
      <FloatingChat />
    </>
  );
}
