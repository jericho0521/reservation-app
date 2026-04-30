import { createContentPost, listContentPosts } from "@/app/api/content-posts";

export function GET(request: Request) {
  return listContentPosts(request, "blog");
}

export function POST(request: Request) {
  return createContentPost(request, "blog");
}
