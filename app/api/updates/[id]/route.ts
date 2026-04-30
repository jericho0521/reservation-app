import { archiveContentPost, getContentPost, updateContentPost } from "@/app/api/content-posts";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return getContentPost(id, "update");
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return updateContentPost(request, id, "update");
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return archiveContentPost(id, "update");
}
