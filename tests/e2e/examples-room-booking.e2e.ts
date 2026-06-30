import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const exampleRoot = path.resolve("apps/examples/room-booking");

test("room booking example is wired to the reusable frontend modules", async () => {
  const packageJson = JSON.parse(await readFile(path.join(exampleRoot, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
  };
  const pageSource = await readFile(path.join(exampleRoot, "app/page.tsx"), "utf8");
  const configSource = await readFile(path.join(exampleRoot, "reservation.config.ts"), "utf8");

  assert.equal(packageJson.dependencies?.["@reservation-platform/react"], "workspace:*");
  assert.equal(packageJson.dependencies?.["@reservation-platform/ui"], "workspace:*");
  assert.match(pageSource, /<BookingFlow/u);
  assert.match(configSource, /NEXT_PUBLIC_RESERVATION_PLATFORM_BASE_URL/u);
  assert.match(configSource, /NEXT_PUBLIC_RESERVATION_SERVICE_ID/u);
});

test("room booking example page responds when an app URL is configured", async (context) => {
  const rawUrl = process.env.ROOM_BOOKING_E2E_BASE_URL;
  if (!rawUrl) {
    context.skip("Set ROOM_BOOKING_E2E_BASE_URL to run the live room-booking page check.");
    return;
  }

  const response = await fetch(new URL("/", rawUrl), {
    signal: AbortSignal.timeout(readTimeoutMs()),
  });
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /Room|Booking|backend configuration|required/i);
});

function readTimeoutMs() {
  const value = Number(process.env.ROOM_BOOKING_E2E_TIMEOUT_MS ?? process.env.RESERVATION_SMOKE_TIMEOUT_MS ?? "5000");
  return Number.isFinite(value) && value > 0 ? value : 5000;
}
