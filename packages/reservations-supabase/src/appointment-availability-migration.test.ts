import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const migration = readFileSync(resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../database/migrations/supabase/000028_appointment_availability_management.sql",
), "utf8");

test("appointment migration serializes buffered conflicts by practitioner", () => {
  assert.match(migration, /for update of staff, resource/i);
  assert.match(migration, /existing\.staff_id = v_staff_id/i);
  assert.match(migration, /existing\.status in \('pending', 'confirmed'\)/i);
  assert.match(migration, /buffer_before_minutes/i);
  assert.match(migration, /buffer_after_minutes/i);
  assert.match(migration, /platform_staff_services/i);
  assert.match(migration, /platform_staff_locations/i);
});

test("managed reschedule validates and updates atomically", () => {
  assert.match(migration, /create or replace function public\.reschedule_managed_reservation/i);
  assert.match(migration, /tokens\.token_hash = lower\(trim\(p_token_hash\)\)/i);
  assert.match(migration, /minimum_notice_minutes/i);
  assert.match(migration, /existing\.id <> v_booking\.id/i);
  assert.match(migration, /reservation\.customer_rescheduled/i);
  assert.match(migration, /customer_management_link/i);
});
