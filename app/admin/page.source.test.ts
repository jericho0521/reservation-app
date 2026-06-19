import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

test("admin page keeps reservation data behind the server loader", () => {
  assert.doesNotMatch(source, /\.from\(\s*['"]bookings['"]\s*\)/);
  assert.doesNotMatch(source, /ADMIN_BOOKINGS_SELECT/);
  assert.match(source, /import\s+\{\s*loadAdminReservations\s*\}\s+from\s+['"]@\/lib\/admin-reservations-loader['"]/);
  assert.match(source, /loadAdminReservations\(\{\s*today\s*\}\)/);
});
