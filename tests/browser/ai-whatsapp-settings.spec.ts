import { expect, test } from "@playwright/test";
import {
  consoleOrigin,
  hasConsoleAuthentication,
  openAuthenticatedConsole,
  originAvailable,
} from "./support/release-fixture";

test.beforeEach(async ({ request }) => {
  test.skip(!(await originAvailable(request, consoleOrigin)), "Console origin is not available.");
  test.skip(!hasConsoleAuthentication(), "Owner credentials or a storage state are required.");
});

test("AI provider settings keep credentials write-only", async ({ page }) => {
  await openAuthenticatedConsole(page, "/admin/settings/ai");
  await expect(page.getByRole("heading", { name: "AI booking assistant" })).toBeVisible();
  await expect(page.getByLabel("API key")).toHaveAttribute("type", "password");
  await expect(page.getByRole("button", { name: "Save AI settings" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Test connection" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/sk-[A-Za-z0-9_-]{8,}/u);
});

test("WhatsApp channel reports readiness without exposing a QR payload", async ({ page }) => {
  await openAuthenticatedConsole(page, "/admin/channels");
  await expect(page.getByRole("heading", { name: "Know what is demo-ready" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Channel readiness" })).toContainText("WhatsApp");
  await expect(page.locator("[data-session-state]").first()).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/QR payload:\s*\S+/u);
});
