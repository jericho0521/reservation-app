import assert from "node:assert/strict";
import test from "node:test";

import {
  bootstrapLocalOwner,
  buildLocalOwnerBootstrapSql,
} from "./local-stack-owner.js";

test("local owner bootstrap hashes the chosen password and targets only the demo owner", async () => {
  let sql = "";
  const result = await bootstrapLocalOwner({
    displayName: "  Local Owner  ",
    email: "  OWNER@EXAMPLE.COM  ",
    password: "correct horse battery staple",
    passwordConfirmation: "correct horse battery staple",
  }, {
    hashPassword: async (password) => {
      assert.equal(password, "correct horse battery staple");
      return "$argon2id$local-hash";
    },
    runSql: (value) => { sql = value; },
  });

  assert.deepEqual(result, { displayName: "Local Owner", email: "owner@example.com" });
  assert.match(sql, /reservation_local_stack_state/u);
  assert.match(sql, /final-demo-v1/u);
  assert.match(sql, /00000000-0000-4000-8000-000000000701/u);
  assert.match(sql, /tenant_id = 'final_demo'/u);
  assert.match(sql, /domain = 'localhost'/u);
  assert.match(sql, /\$argon2id\$local-hash/u);
  assert.doesNotMatch(sql, /correct horse battery staple/u);
  assert.match(sql, /delete from public\.platform_sessions/u);
});

test("local owner bootstrap reports the invalid field before hashing or database access", async () => {
  let calls = 0;
  const dependencies = {
    hashPassword: async () => { calls += 1; return "unused"; },
    runSql: () => { calls += 1; },
  };

  await assert.rejects(() => bootstrapLocalOwner({
    displayName: " ",
    email: "owner@example.com",
    password: "valid-password",
    passwordConfirmation: "valid-password",
  }, dependencies), /valid owner name/u);

  await assert.rejects(() => bootstrapLocalOwner({
    displayName: "Owner",
    email: "not-an-email",
    password: "valid-password",
    passwordConfirmation: "valid-password",
  }, dependencies), /valid owner email address/u);

  await assert.rejects(() => bootstrapLocalOwner({
    displayName: "Owner",
    email: "owner@example.com",
    password: "short",
    passwordConfirmation: "short",
  }, dependencies), /at least 12 characters/u);

  await assert.rejects(() => bootstrapLocalOwner({
    displayName: "Owner",
    email: "owner@example.com",
    password: "valid-password",
    passwordConfirmation: "different-password",
  }, dependencies), /confirmation does not match/u);

  assert.equal(calls, 0);
});

test("local owner SQL escapes user-controlled values", () => {
  const sql = buildLocalOwnerBootstrapSql({
    displayName: "Owner's Desk",
    email: "owner@example.com",
    passwordHash: "$argon2id$hash'part",
  });
  assert.match(sql, /Owner''s Desk/u);
  assert.match(sql, /\$argon2id\$hash''part/u);
});
