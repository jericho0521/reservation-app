import type { Metadata } from "next";
import Header from "@/components/shared/Header";
import Footer from "@/components/shared/Footer";
import FloatingChat from "@/components/chat/FloatingChat";
import { PublicContentDetail } from "@/components/content/PublicContentDetail";
import { getPublishedContentPostBySlug } from "@/lib/content-posts";

interface UpdateDetailPageProps {
  params: Promise<{ slug: string }>;
}

export const revalidate = 300;

export async function generateMetadata({ params }: UpdateDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedContentPostBySlug("update", slug);

  return {
    title: post.title,
    description: post.excerpt || undefined,
  };
}

export default async function UpdateDetailPage({ params }: UpdateDetailPageProps) {
  const { slug } = await params;
  const post = await getPublishedContentPostBySlug("update", slug);

  return (
    <>
      <Header />
      <PublicContentDetail section="update" post={post} />
      <Footer />
      <FloatingChat />
    </>
  );
}
