import assert from "node:assert/strict";
import test from "node:test";
import {
  getSupabaseAdminConfig,
  MissingSupabaseServiceRoleKeyError,
} from "./supabase-admin";

test("getSupabaseAdminConfig requires SUPABASE_SERVICE_ROLE_KEY", () => {
  assert.throws(
    () => getSupabaseAdminConfig({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    }),
    MissingSupabaseServiceRoleKeyError,
  );
});

test("getSupabaseAdminConfig returns server-only Supabase admin config", () => {
  assert.deepEqual(
    getSupabaseAdminConfig({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    }),
    {
      supabaseUrl: "https://example.supabase.co",
      serviceRoleKey: "service-role-key",
    },
  );
});
