import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import type { BlogPostRecord, ContentSectionType } from "@/lib/blogs";

export async function loadAdminContentList(section: ContentSectionType) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  const { data, error } = await supabase
    .from("content_posts")
    .select("*")
    .eq("section", section)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error(`Failed to load ${section} content:`, error);
  }

  return {
    posts: (data ?? []) as BlogPostRecord[],
    userEmail: user.email || "",
  };
}

export async function loadAdminContentPost(section: ContentSectionType, id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  const { data, error } = await supabase
    .from("content_posts")
    .select("*")
    .eq("id", id)
    .eq("section", section)
    .single();

  if (error || !data) {
    notFound();
  }

  return {
    post: data as BlogPostRecord,
    userEmail: user.email || "",
  };
}

export async function requireAdminEmail() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  return user.email || "";
}
