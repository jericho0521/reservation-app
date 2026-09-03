import type { Metadata } from "next";
import { ContentEditor } from "@/components/admin/ContentEditor";
import { requireAdminEmail } from "@/app/admin/content-pages";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "New blog post · Admin" };

export default async function NewBlogPage() {
  const userEmail = await requireAdminEmail();

  return <ContentEditor section="blog" userEmail={userEmail} />;
}
