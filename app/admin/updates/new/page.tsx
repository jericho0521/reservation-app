import type { Metadata } from "next";
import { ContentEditor } from "@/components/admin/ContentEditor";
import { requireAdminEmail } from "@/app/admin/content-pages";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "New update · Admin" };

export default async function NewUpdatePage() {
  const userEmail = await requireAdminEmail();

  return <ContentEditor section="update" userEmail={userEmail} />;
}
