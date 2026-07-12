import assert from "node:assert/strict";
import test from "node:test";
import { assertSafeFinalDemoReset, parseFinalDemoResetConfig } from "./reset-final-demo.mjs";

test("final demo reset accepts validation-only mode without a database URL", () => {
  assert.deepEqual(assertSafeFinalDemoReset(parseFinalDemoResetConfig({})), { mode: "static" });
});

test("final demo reset requires explicit confirmation even for localhost", () => {
  assert.throws(() => assertSafeFinalDemoReset(parseFinalDemoResetConfig({ FINAL_DEMO_DATABASE_URL: "postgresql://user:secret@localhost:5432/demo" })), /RESET_FINAL_DEMO/u);
});

test("final demo reset refuses remote hosts unless explicitly allowlisted", () => {
  const base = { FINAL_DEMO_DATABASE_URL: "postgresql://user:secret@db.example.test/demo", RESERVATION_DEMO_RESET_CONFIRM: "RESET_FINAL_DEMO" };
  assert.throws(() => assertSafeFinalDemoReset(parseFinalDemoResetConfig(base)), /non-local/u);
  assert.equal(assertSafeFinalDemoReset(parseFinalDemoResetConfig({ ...base, RESERVATION_DEMO_RESET_ALLOW_HOSTS: "db.example.test" })).mode, "database");
});

test("final demo reset rejects non-PostgreSQL URLs", () => {
  assert.throws(() => assertSafeFinalDemoReset(parseFinalDemoResetConfig({ FINAL_DEMO_DATABASE_URL: "https://localhost/demo", RESERVATION_DEMO_RESET_CONFIRM: "RESET_FINAL_DEMO" })), /PostgreSQL/u);
});
