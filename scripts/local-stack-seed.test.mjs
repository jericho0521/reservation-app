import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
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

test("browser release fixtures persist only hashes of loopback-only capabilities", async () => {
  const seed = await readFile(new URL("../packages/database/seeds/final-demo.sql", import.meta.url), "utf8");
  const sessionToken = "browser-fixture-session-token-0000000000001";
  const managementToken = "browser-fixture-management-token-0000000001";
  for (const token of [sessionToken, managementToken]) {
    assert.doesNotMatch(seed, new RegExp(token, "u"));
    assert.match(seed, new RegExp(createHash("sha256").update(token).digest("hex"), "u"));
  }
  assert.match(seed, /local-browser-fixture-disabled-login/u);
});

test("final demo appointment practitioners have profile, location, service, and resource links", async () => {
  const seed = await readFile(new URL("../packages/database/seeds/final-demo.sql", import.meta.url), "utf8");

  assert.match(seed, /insert into public\.platform_staff_profiles/u);
  assert.match(seed, /insert into public\.platform_staff_locations/u);
  assert.match(seed, /insert into public\.platform_staff_services/u);
  assert.match(seed, /'Luma Consultation'[\s\S]*'appointment', 30, 0, 0/u);
  assert.ok(
    seed.indexOf("delete from public.bookings") < seed.indexOf("delete from public.platform_staff_profiles"),
    "bookings must be deleted before their referenced staff profiles",
  );
  assert.ok(
    seed.indexOf("delete from public.platform_audit_events") < seed.indexOf("delete from public.platform_users"),
    "audit events must be deleted before their referenced users",
  );
  for (const staffId of [
    "00000000-0000-4000-8000-000000000801",
    "00000000-0000-4000-8000-000000000802",
  ]) {
    assert.match(seed, new RegExp(`"platform_staff_id":"${staffId}"`, "u"));
  }
  assert.match(seed, /'appointment', 30, 0, 0\);/u);
});
