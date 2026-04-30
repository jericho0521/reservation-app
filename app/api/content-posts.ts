import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabase as createPublicSupabase } from "@/lib/supabase";
import { jsonError, requireAuthenticatedSupabase, supabaseErrorStatus } from "@/app/api/api-utils";
import {
  normalizeBlogPostInput,
  type BlogPostRecord,
  type ContentSectionType,
} from "@/lib/blogs";

function mapInputToRow(input: unknown, section: ContentSectionType, authorId?: string) {
  const normalized = normalizeBlogPostInput(input);

  return {
    section,
    title: normalized.title,
    slug: normalized.slug,
    excerpt: normalized.excerpt,
    content: normalized.content,
    cover_image_url: normalized.coverImageUrl,
    status: normalized.status,
    published_at: normalized.publishedAt,
    author_id: authorId,
    seo_title: normalized.seoTitle,
    seo_description: normalized.seoDescription,
  };
}

function isDuplicateSlugError(error: unknown) {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

export async function listContentPosts(request: Request, section: ContentSectionType) {
  try {
    const url = new URL(request.url);
    const includeDrafts = url.searchParams.get("includeDrafts") === "true";
    const supabase = includeDrafts ? await createClient() : createPublicSupabase();

    let query = supabase
      .from("content_posts")
      .select("*")
      .eq("section", section)
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (includeDrafts) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return jsonError("Admin authentication required", 401);
      }
    } else {
      query = query.eq("status", "published");
    }

    const { data, error } = await query;

    if (error) throw error;

    return NextResponse.json((data ?? []) as BlogPostRecord[]);
  } catch (error) {
    console.error(`Failed to list ${section} posts:`, error);
    return jsonError("Failed to list content", 500);
  }
}

export async function createContentPost(request: Request, section: ContentSectionType) {
  const { response, supabase, user } = await requireAuthenticatedSupabase();
  if (response) return response;

  try {
    const body = await request.json();
    const row = mapInputToRow(body, section, (user as { id?: string }).id);

    const { data, error } = await supabase
      .from("content_posts")
      .insert(row)
      .select()
      .single();

    if (error) {
      if (isDuplicateSlugError(error)) {
        return jsonError("A post with this slug already exists in this section", 409);
      }
      throw error;
    }

    return NextResponse.json(data as BlogPostRecord, { status: 201 });
  } catch (error) {
    console.error(`Failed to create ${section} post:`, error);
    return jsonError("Failed to create content", 500);
  }
}

export async function getContentPost(id: string, section: ContentSectionType) {
  const { response, supabase } = await requireAuthenticatedSupabase();
  if (response) return response;

  try {
    const { data, error } = await supabase
      .from("content_posts")
      .select("*")
      .eq("id", id)
      .eq("section", section)
      .single();

    if (error) {
      return jsonError("Content not found", supabaseErrorStatus(error));
    }

    return NextResponse.json(data as BlogPostRecord);
  } catch (error) {
    console.error(`Failed to fetch ${section} post:`, error);
    return jsonError("Failed to fetch content", 500);
  }
}

export async function updateContentPost(request: Request, id: string, section: ContentSectionType) {
  const { response, supabase } = await requireAuthenticatedSupabase();
  if (response) return response;

  try {
    const body = await request.json();
    const row = mapInputToRow(body, section);

    const { data, error } = await supabase
      .from("content_posts")
      .update(row)
      .eq("id", id)
      .eq("section", section)
      .select()
      .single();

    if (error) {
      if (isDuplicateSlugError(error)) {
        return jsonError("A post with this slug already exists in this section", 409);
      }
      return jsonError("Failed to update content", supabaseErrorStatus(error));
    }

    return NextResponse.json(data as BlogPostRecord);
  } catch (error) {
    console.error(`Failed to update ${section} post:`, error);
    return jsonError("Failed to update content", 500);
  }
}

export async function archiveContentPost(id: string, section: ContentSectionType) {
  const { response, supabase } = await requireAuthenticatedSupabase();
  if (response) return response;

  try {
    const { data, error } = await supabase
      .from("content_posts")
      .update({ status: "archived", published_at: null })
      .eq("id", id)
      .eq("section", section)
      .select()
      .single();

    if (error) {
      return jsonError("Failed to archive content", supabaseErrorStatus(error));
    }

    return NextResponse.json(data as BlogPostRecord);
  } catch (error) {
    console.error(`Failed to archive ${section} post:`, error);
    return jsonError("Failed to archive content", 500);
  }
}
