import assert from "node:assert/strict";
import test from "node:test";

import { assertLocalStackDatabaseTarget, shouldApplySeed } from "./local-stack-seed.mjs";

test("seed accepts only the Compose-managed local database identity", () => {
  assert.doesNotThrow(() => assertLocalStackDatabaseTarget("postgresql://postgres:secret@reservation-db:5432/reservation"));
  for (const url of [
    "postgresql://postgres:secret@localhost:5432/reservation",
    "postgresql://postgres:secret@reservation-db:5432/production",
    "postgresql://admin:secret@reservation-db:5432/reservation",
    "https://reservation-db:5432/reservation",
  ]) {
    assert.throws(() => assertLocalStackDatabaseTarget(url), /Compose-managed local database/u);
  }
});

test("first-run seed preserves existing data while reset always applies", () => {
  assert.equal(shouldApplySeed(false, "first-run"), true);
  assert.equal(shouldApplySeed(true, "first-run"), false);
  assert.equal(shouldApplySeed(false, "reset"), true);
  assert.equal(shouldApplySeed(true, "reset"), true);
  assert.throws(() => shouldApplySeed(false, "automatic"), /first-run or reset/u);
});
