import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("fresh demo data drives operations, maintenance, channel, and analytics proof", async () => {
  const seed = await readFile("packages/database/seeds/final-demo.sql", "utf8");
  for (const proof of ["service_seat_maintenance", "platform_conversations", "reservation_items", "'simulation'", "'manual'"]) assert.equal(seed.includes(proof), true, proof);
  const sql = await readFile("packages/database/migrations/supabase/000020_operations_analytics_rpc.sql", "utf8");
  assert.match(sql, /read_platform_operations_overview/u);
  assert.match(sql, /read_platform_analytics/u);
  assert.match(sql, /case when .* = 0 then 0/isu);
  assert.match(sql, /p_include_simulation/u);
});

test("owner command center links reservations, conversations, maintenance, channels, and analytics", async () => {
  const shell = await readFile("apps/console/components/console-shell.tsx", "utf8");
  for (const href of ["/reservations", "/conversations", "/resources", "/channels", "/analytics"]) assert.equal(shell.includes(`href="${href}"`), true, href);
});
