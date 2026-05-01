import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { BlogPostRecord, ContentSectionType } from "@/lib/blogs";

export async function listPublishedContentPosts(section: ContentSectionType) {
  const { data, error } = await supabase()
    .from("content_posts")
    .select("*")
    .eq("section", section)
    .eq("status", "published")
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error(`Failed to load ${section} posts:`, error);
    return [];
  }

  return (data ?? []) as BlogPostRecord[];
}

export async function getPublishedContentPostBySlug(section: ContentSectionType, slug: string) {
  const { data, error } = await supabase()
    .from("content_posts")
    .select("*")
    .eq("section", section)
    .eq("slug", slug)
    .eq("status", "published")
    .single();

  if (error || !data) {
    notFound();
  }

  return data as BlogPostRecord;
}

export async function listAdminContentPosts(section: ContentSectionType) {
  const { data, error } = await supabase()
    .from("content_posts")
    .select("*")
    .eq("section", section)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error(`Failed to load admin ${section} posts:`, error);
    return [];
  }

  return (data ?? []) as BlogPostRecord[];
}
