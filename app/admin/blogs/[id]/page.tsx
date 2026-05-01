import { ContentEditor } from "@/components/admin/ContentEditor";
import { loadAdminContentPost } from "@/app/admin/content-pages";

interface EditBlogPageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function EditBlogPage({ params }: EditBlogPageProps) {
  const { id } = await params;
  const { post, userEmail } = await loadAdminContentPost("blog", id);

  return <ContentEditor section="blog" post={post} userEmail={userEmail} />;
}
