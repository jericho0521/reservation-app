import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export type AuthenticatedSupabase = Awaited<ReturnType<typeof createClient>>;

interface AuthCapableClient {
  rpc: (name: "is_admin") => PromiseLike<{ data: unknown; error: unknown }>;
  auth: {
    getUser: () => Promise<{
      data: {
        user: { id: string } | null;
      };
      error: unknown;
    }>;
  };
}

export function jsonError(
  error: string,
  status: number,
  details?: Record<string, unknown>,
) {
  return NextResponse.json({ error, ...details }, { status });
}

export function isSupabaseNotFoundError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as { code?: string; message?: string };

  return (
    maybeError.code === "PGRST116" ||
    maybeError.message?.includes("JSON object requested, multiple (or no) rows returned") === true
  );
}

export function supabaseErrorStatus(error: unknown) {
  const code = error && typeof error === 'object' ? (error as { code?: string }).code : undefined;
  if (code === '23P01' || code === '40001' || code === '23505') return 409;
  if (code === '23514' || code === '22007' || code === '22008') return 400;
  return isSupabaseNotFoundError(error) ? 404 : 500;
}

type AuthResult<Client> = {
  response: NextResponse;
  supabase: Client;
  user: null;
} | {
  response: null;
  supabase: Client;
  user: { id: string };
};

export async function requireAdminSupabase(): Promise<AuthResult<AuthenticatedSupabase>>;
export async function requireAdminSupabase<
  Client extends AuthCapableClient,
>(
  createSupabaseClient: () => Promise<Client>,
): Promise<AuthResult<Client>>;
export async function requireAdminSupabase<Client extends AuthCapableClient>(
  createSupabaseClient?: () => Promise<Client>,
) {
  const supabase = createSupabaseClient
    ? await createSupabaseClient()
    : await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      response: jsonError("Admin authentication required", 401),
      supabase,
      user: null,
    };
  }

  const { data: isAdmin, error: roleError } = await supabase.rpc("is_admin");
  if (roleError || isAdmin !== true) {
    return { response: jsonError("Administrator access required", 403), supabase, user: null };
  }

  return {
    response: null,
    supabase,
    user,
  };
}
