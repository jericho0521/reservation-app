import type { Metadata } from "next";
import { ContentEditor } from "@/components/admin/ContentEditor";
import { loadAdminContentPost } from "@/app/admin/content-pages";

interface EditUpdatePageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Edit update · Admin" };

export default async function EditUpdatePage({ params }: EditUpdatePageProps) {
  const { id } = await params;
  const { post, userEmail } = await loadAdminContentPost("update", id);

  return <ContentEditor section="update" post={post} userEmail={userEmail} />;
}
