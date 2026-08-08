import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export class MissingSupabaseServiceRoleKeyError extends Error {
  constructor(message = "Missing SUPABASE_SERVICE_ROLE_KEY") {
    super(message);
    this.name = "MissingSupabaseServiceRoleKeyError";
  }
}

interface SupabaseAdminEnvironment {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

export function getSupabaseAdminConfig(env: SupabaseAdminEnvironment = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
}) {
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new MissingSupabaseServiceRoleKeyError("Missing NEXT_PUBLIC_SUPABASE_URL");
  }

  if (!serviceRoleKey) {
    throw new MissingSupabaseServiceRoleKeyError();
  }

  return { supabaseUrl, serviceRoleKey };
}

export function supabaseAdmin(): SupabaseClient {
  if (!client) {
    const { supabaseUrl, serviceRoleKey } = getSupabaseAdminConfig();

    client = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return client;
}
