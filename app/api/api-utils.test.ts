import assert from "node:assert/strict";
import test from "node:test";
import {
  isSupabaseNotFoundError,
  jsonError,
  requireAuthenticatedSupabase,
  supabaseErrorStatus,
} from "./api-utils";

test("isSupabaseNotFoundError detects PostgREST no-row errors", () => {
  assert.equal(isSupabaseNotFoundError({ code: "PGRST116" }), true);
  assert.equal(
    isSupabaseNotFoundError({
      message: "JSON object requested, multiple (or no) rows returned",
    }),
    true,
  );
  assert.equal(isSupabaseNotFoundError({ code: "42501" }), false);
});

test("supabaseErrorStatus maps no-row errors to 404", () => {
  assert.equal(supabaseErrorStatus({ code: "PGRST116" }), 404);
  assert.equal(supabaseErrorStatus({ message: "permission denied" }), 500);
});

test("jsonError returns the standard API error shape", async () => {
  const response = jsonError("Invalid booking data", 400, { details: ["bad"] });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "Invalid booking data",
    details: ["bad"],
  });
});

test("requireAuthenticatedSupabase returns 401 response without a user", async () => {
  const result = await requireAuthenticatedSupabase(async () => ({
    auth: {
      getUser: async () => ({
        data: { user: null },
        error: null,
      }),
    },
  }));

  assert.equal(result.response?.status, 401);
  assert.deepEqual(await result.response?.json(), {
    error: "Admin authentication required",
  });
});
