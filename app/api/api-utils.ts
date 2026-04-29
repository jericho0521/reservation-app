import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export type AuthenticatedSupabase = Awaited<ReturnType<typeof createClient>>;

interface AuthCapableClient {
  auth: {
    getUser: () => Promise<{
      data: {
        user: unknown | null;
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
  return isSupabaseNotFoundError(error) ? 404 : 500;
}

type AuthResult<Client> = {
  response: NextResponse;
  supabase: Client;
  user: null;
} | {
  response: null;
  supabase: Client;
  user: unknown;
};

export async function requireAuthenticatedSupabase(): Promise<AuthResult<AuthenticatedSupabase>>;
export async function requireAuthenticatedSupabase<
  Client extends AuthCapableClient,
>(
  createSupabaseClient: () => Promise<Client>,
): Promise<AuthResult<Client>>;
export async function requireAuthenticatedSupabase<Client extends AuthCapableClient>(
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

  return {
    response: null,
    supabase,
    user,
  };
}
